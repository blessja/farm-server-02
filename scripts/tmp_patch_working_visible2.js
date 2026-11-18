const fs = require('fs');
const p = 'mobile/src/screens/CheckedInScreen.js';
let s = fs.readFileSync(p, 'utf8');

function mustReplace(old, neu) {
  if (!s.includes(old)) throw new Error('missing: ' + JSON.stringify(old.slice(0, 120)));
  s = s.replace(old, neu);
}
function replaceAllStr(old, neu) {
  if (!s.includes(old)) throw new Error('missing all: ' + JSON.stringify(old.slice(0, 120)));
  s = s.split(old).join(neu);
}

// targetRowOccupants (move modal) -> visible
s = s.replace(
  /return dayWorkRecords\.filter\(\s*\(r\) =>\s*r\.blockName === moveTargetBlock &&\s*String\(r\.rowNumber\) === String\(moveTargetRow\) &&\s*String\(r\.job_type \|\| ""\)\.toUpperCase\(\) === currentJobType\s*\);\s*\}, \[dayWorkRecords, moveWorker, moveTargetBlock, moveTargetRow\]\);/,
  `return visibleDayWorkRecords.filter(
      (r) =>
        r.blockName === moveTargetBlock &&
        String(r.rowNumber) === String(moveTargetRow) &&
        String(r.job_type || "").toUpperCase() === currentJobType
    );
  }, [visibleDayWorkRecords, moveWorker, moveTargetBlock, moveTargetRow]);`
);

// expandedRecord
mustReplace(
  '    dayWorkRecords.find((r) => `${r.workerID}-${r.rowNumber}` === expandedWorker) || null;',
  '    visibleDayWorkRecords.find((r) => `${r.workerID}-${r.rowNumber}` === expandedWorker) || null;'
);

// inlineTargetRowOccupants
s = s.replace(
  /return dayWorkRecords\.filter\(\s*\(r\) =>\s*r\.blockName === inlineMoveTargetBlock &&\s*String\(r\.rowNumber\) === String\(inlineMoveTargetRow\) &&\s*String\(r\.job_type \|\| ""\)\.toUpperCase\(\) === currentJobType\s*\);\s*\}, \[dayWorkRecords, expandedRecord, inlineMoveTargetBlock, inlineMoveTargetRow\]\);/,
  `return visibleDayWorkRecords.filter(
      (r) =>
        r.blockName === inlineMoveTargetBlock &&
        String(r.rowNumber) === String(inlineMoveTargetRow) &&
        String(r.job_type || "").toUpperCase() === currentJobType
    );
  }, [visibleDayWorkRecords, expandedRecord, inlineMoveTargetBlock, inlineMoveTargetRow]);`
);

replaceAllStr('    const occupants = dayWorkRecords.filter(', '    const occupants = visibleDayWorkRecords.filter(');
// inline move eligible workers
s = s.replace(/dayWorkRecords\.filter\(\s*\(r\) =>\s*r\.blockName === inlineMoveTargetBlock \|\| r\.blockName === expandedRecord\.blockName\s*\)/g,
  'visibleDayWorkRecords.filter(\n      (r) =>\n        r.blockName === inlineMoveTargetBlock || r.blockName === expandedRecord.blockName\n    )');
// checkout modal eligible workers
s = s.replace(/dayWorkRecords\.filter\(\s*\(r\) =>\s*r\.blockName === checkoutWorker\.blockName \|\| r\.blockName === moveTargetBlock\s*\)/g,
  'visibleDayWorkRecords.filter(\n      (r) =>\n        r.blockName === checkoutWorker.blockName || r.blockName === moveTargetBlock\n    )');

mustReplace(
  '        subtitle={t("ci.currentlyWorkingSub", { count: dayWorkRecords.length })}',
  '        subtitle={selectedWorkingJob ? `${selectedWorkingJob} · ${t("ci.currentlyWorkingSub", { count: visibleDayWorkRecords.length })}` : t("ci.currentlyWorkingSub", { count: visibleDayWorkRecords.length })}'
);
mustReplace('        {checkinsState.loading && !dayWorkRecords.length ? (', '        {checkinsState.loading && !visibleDayWorkRecords.length ? (');
mustReplace('        {!dayWorkRecords.length && !checkinsState.loading ? (', '        {!visibleDayWorkRecords.length && !checkinsState.loading ? (');
replaceAllStr('                                    count: dayWorkRecords.filter(', '                                    count: visibleDayWorkRecords.filter(');
replaceAllStr('            {dayWorkRecords.length === 0 ? (', '            {visibleDayWorkRecords.length === 0 ? (');
replaceAllStr('            {dayWorkRecords.map((w, index) => {', '            {visibleDayWorkRecords.map((w, index) => {');
replaceAllStr('                              count: dayWorkRecords.filter(', '                              count: visibleDayWorkRecords.filter(');

fs.writeFileSync(p, s);
console.log('patched visible 2');
