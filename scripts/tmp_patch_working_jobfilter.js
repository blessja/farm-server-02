const fs = require('fs');
const p = 'mobile/src/screens/CheckedInScreen.js';
let s = fs.readFileSync(p, 'utf8');

const old = `  const [collapsedBlocks, setCollapsedBlocks] = useState({});

  const defaultCollapsedBlocks = useMemo(() => {
    const map = {};
    dayWorkRecords.forEach((r) => {
      const jobType = String(r.job_type || "").toUpperCase();
      if (FAST_JOB_TYPES.includes(jobType)) {
        map[r.blockName || t("common.unknown")] = true;
      }
    });
    return map;
  }, [dayWorkRecords, t]);`;

const rep = `  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  const [selectedWorkingJob, setSelectedWorkingJob] = useState("");

  const availableWorkingJobs = useMemo(() => {
    const set = new Set(
      dayWorkRecords
        .map((r) => String(r.job_type || "").trim().toUpperCase())
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dayWorkRecords]);

  React.useEffect(() => {
    if (!availableWorkingJobs.length) {
      if (selectedWorkingJob) setSelectedWorkingJob("");
      return;
    }
    if (!selectedWorkingJob || !availableWorkingJobs.includes(selectedWorkingJob)) {
      setSelectedWorkingJob(availableWorkingJobs[0]);
    }
  }, [availableWorkingJobs, selectedWorkingJob]);

  const visibleDayWorkRecords = useMemo(() => {
    if (!selectedWorkingJob) return dayWorkRecords;
    return dayWorkRecords.filter(
      (r) => String(r.job_type || "").trim().toUpperCase() === selectedWorkingJob
    );
  }, [dayWorkRecords, selectedWorkingJob]);

  const defaultCollapsedBlocks = useMemo(() => {
    const map = {};
    visibleDayWorkRecords.forEach((r) => {
      const jobType = String(r.job_type || "").toUpperCase();
      if (FAST_JOB_TYPES.includes(jobType)) {
        map[r.blockName || t("common.unknown")] = true;
      }
    });
    return map;
  }, [visibleDayWorkRecords, t]);`;

if (!s.includes(old)) { console.error('not found'); process.exit(1); }
s = s.replace(old, rep);

// Use filtered records for grouping/counts
s = s.replace(
  '  const workerCountByRow = dayWorkRecords.reduce((acc, item) => {',
  '  const workerCountByRow = visibleDayWorkRecords.reduce((acc, item) => {'
);
s = s.replace(
  '  const groupedByBlock = dayWorkRecords.reduce((acc, item) => {',
  '  const groupedByBlock = visibleDayWorkRecords.reduce((acc, item) => {'
);

fs.writeFileSync(p, s);
console.log('ok');
