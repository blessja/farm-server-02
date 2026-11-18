const fs = require('fs');
const p = 'mobile/src/screens/CheckedInScreen.js';
let s = fs.readFileSync(p, 'utf8');

function repAll(old, neu) {
  if (!s.includes(old)) throw new Error('missing: ' + old.slice(0, 80));
  s = s.split(old).join(neu);
}

// Keep availability derivation and base memo from dayWorkRecords, but switch UI/ops to visibleDayWorkRecords
repAll('    return dayWorkRecords.filter(\n      (r) =>\n        r.blockName === moveTargetBlock &&\n        String(r.rowNumber) === String(moveTargetRow) &&\n        String(r.job_type || "").toUpperCase() === currentJobType\n    );\n  }, [dayWorkRecords, moveWorker, moveTargetBlock, moveTargetRow]);',
'    return visibleDayWorkRecords.filter(\n      (r) =>\n        r.blockName === moveTargetBlock &&\n        String(r.rowNumber) === String(moveTargetRow) &&\n        String(r.job_type || "").toUpperCase() === currentJobType\n    );\n  }, [visibleDayWorkRecords, moveWorker, moveTargetBlock, moveTargetRow]);');

repAll('    dayWorkRecords.find((r) => `${r.workerID}-${r.rowNumber}` === expandedWorker) || null;',
'    visibleDayWorkRecords.find((r) => `${r.workerID}-${r.rowNumber}` === expandedWorker) || null;');

repAll('    return dayWorkRecords.filter(\n      (r) =>\n        r.blockName === inlineMoveTargetBlock &&\n        String(r.rowNumber) === String(inlineMoveTargetRow) &&\n        String(r.job_type || "").toUpperCase() === currentJobType\n    );\n  }, [dayWorkRecords, expandedRecord, inlineMoveTargetBlock, inlineMoveTargetRow]);',
'    return visibleDayWorkRecords.filter(\n      (r) =>\n        r.blockName === inlineMoveTargetBlock &&\n        String(r.rowNumber) === String(inlineMoveTargetRow) &&\n        String(r.job_type || "").toUpperCase() === currentJobType\n    );\n  }, [visibleDayWorkRecords, expandedRecord, inlineMoveTargetBlock, inlineMoveTargetRow]);');

repAll('    const occupants = dayWorkRecords.filter(',
'    const occupants = visibleDayWorkRecords.filter(');

repAll('      dayWorkRecords.filter(',
'      visibleDayWorkRecords.filter(');

repAll('        subtitle={t("ci.currentlyWorkingSub", { count: dayWorkRecords.length })}',
'        subtitle={selectedWorkingJob ? `${selectedWorkingJob} · ${t("ci.currentlyWorkingSub", { count: visibleDayWorkRecords.length })}` : t("ci.currentlyWorkingSub", { count: visibleDayWorkRecords.length })}');

repAll('        {checkinsState.loading && !dayWorkRecords.length ? (',
'        {checkinsState.loading && !visibleDayWorkRecords.length ? (');

repAll('        {!dayWorkRecords.length && !checkinsState.loading ? (',
'        {!visibleDayWorkRecords.length && !checkinsState.loading ? (');

repAll('                                    count: dayWorkRecords.filter(',
'                                    count: visibleDayWorkRecords.filter(');

repAll('            {dayWorkRecords.length === 0 ? (',
'            {visibleDayWorkRecords.length === 0 ? (');

repAll('            {dayWorkRecords.map((w, index) => {',
'            {visibleDayWorkRecords.map((w, index) => {');

repAll('                              count: dayWorkRecords.filter(',
'                              count: visibleDayWorkRecords.filter(');

fs.writeFileSync(p, s);
console.log('patched visible');
