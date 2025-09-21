const express = require("express");
const router = express.Router();
const { syncClockIns } = require("../controllers/syncController");

router.post("/clockins", syncClockIns);

module.exports = router;
