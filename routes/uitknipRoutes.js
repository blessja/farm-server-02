const express = require("express");
const router = express.Router();
const uitknipController = require("../controllers/uitknipController");

router.post("/bunches/preview", uitknipController.previewBunchImport);
router.post("/bunches/apply", uitknipController.applyBunchImport);
router.get("/totals", uitknipController.getUitknipTotals);
router.get("/hours-totals", uitknipController.getUitknipHoursTotals);
router.get("/hours", uitknipController.getUitknipIntervalHours);
router.post("/hours/save", uitknipController.saveUitknipIntervalHours);
router.post("/hours/save-bulk", uitknipController.saveUitknipIntervalHoursBulk);
router.post("/hours/delete", uitknipController.deleteUitknipIntervalHours);

module.exports = router;
