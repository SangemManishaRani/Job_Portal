const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Applications, Jobs, Employer } = require('../db');
const { z } = require('zod');
const { isEmployer, isEmployee } = require('../middlewares/roleCheck');
const { authMiddleware } = require('../middlewares/auth');
//const sendStatusUpdate = require('../utils/sendMail');

const coverSchema = z.object({
    coverLetter: z.string().min(10).max(1000),
  });
  
  router.post('/apply/:jobID', authMiddleware, isEmployee, async (req, res) => {
    const { jobID } = req.params;
    const { coverLetter } = req.body;
    if (!mongoose.Types.ObjectId.isValid(jobID)) {
        return res.status(400).json({ message: "Invalid job ID format" });
    }
    const validation = coverSchema.safeParse({ coverLetter });
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid cover letter' });
    }
  
    // Check if job exists
    const job = await Jobs.findById(jobID);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
  
    // Check if already applied
    const alreadyApplied = await Applications.findOne({
      employeeID: req.user._id,
      jobID: jobID,
    });
  
    if (alreadyApplied) {
      return res.status(409).json({ error: 'Already applied to this job' });
    }
  
    // Create application
    const application = await Applications.create({
      employeeID: req.user._id,
      jobID,
      coverLetter,
    });
  
    res.status(201).json({
      message: 'Application submitted successfully',
      application,
    });
});

router.get('/viewApplications', authMiddleware, isEmployee, async (req, res) => {
    try {
      const applications = await Applications.find({ employeeID: req.user._id })
      .populate({
        path: 'jobID',
        select: 'title company location postingDate createdBy',
        populate: {
          path: 'createdBy',
          select: 'name companyName image',
        }
      });
  
      res.json({ applications });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error while fetching applications' });
    }
});

// GET /applications/employer-view
router.get('/jobApplications/:jobId', authMiddleware, isEmployer, async (req, res) => {
  const { jobId } = req.params;

  try {
    const applications = await Applications.find({
      jobID: jobId,
      status: { $nin: ['Accepted', 'Rejected'] }})
      .populate({
        path: 'jobID',
        match: { createdBy: req.user._id }, // ensure the job belongs to this employer
        select: 'title location postingDate'
      })
      .populate('employeeID', 'name email') // show applicant info
      .exec();

    // Filter out applications where jobID is null (not the employer’s job)
    const filteredApplications = applications.filter(app => app.jobID !== null);

    res.json({ applications: filteredApplications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while fetching applications' });
  }
});

// PATCH /applications/:applicationId/status
router.patch('/:applicationId/status', authMiddleware, isEmployer, async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body;

  const validStatuses = ['Pending', 'Reviewed', 'Accepted', 'Rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const application = await Applications.findById(applicationId)
      .populate('jobID')
      .populate('employeeID'); // include applicant info

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Make sure the employer owns the job
    if (application.jobID.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to update this application' });
    }

    application.status = status;
    await application.save();

    // Send email if employee info is available
//     const employee = application.employeeID;
//     if (employee && employee.email) {
//       const message = `
// Hi ${employee.name},

// Your application for the job "${application.jobID.title}" at ${application.jobID.company} has been updated.

// New Status: ${status}

// Thanks,
// HireSphere Team
// `;

//       await sendStatusUpdate(employee.email, 'Application Status Update', message);
//     }

    res.json({ message: 'Application status updated and email sent', application });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while updating application status' });
  }
});

  
router.patch('/edit/:id', authMiddleware, isEmployee, async (req, res) => {
    const { coverLetter } = req.body;
    const validation = coverSchema.safeParse({ coverLetter });
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid cover letter' });
    }
    await Applications.findOneAndUpdate({ _id: req.params.id, employeeID: req.user._id }, { coverLetter });
    res.json({ message: 'Application updated' });
});

module.exports = router;