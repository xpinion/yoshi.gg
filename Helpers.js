//================================================================//
//                                                                //
//                   GENERAL HELPER FUNCTIONS                     //
//                                                                //
//================================================================//

function getDaysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function formatDate(d, useSlash = false) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const dateString = d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1).toString().padStart(2, '0') + '/' + d.getUTCDate().toString().padStart(2, '0');
  return useSlash ? dateString : d;
}

function timeStringToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  const p = timeString.split(':').map(s => parseInt(s, 10));
  let s = 0;
  if (p.length === 3) s = (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  else if (p.length === 2) s = (p[0] || 0) * 3600 + (p[1] || 0) * 60;
  return isNaN(s) ? 0 : s;
}

function secondsToTimeString(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function sliceWithTies(array, limit, valueGetter) {
  if (array.length <= limit) return array;
  const cutoffValue = valueGetter(array[limit - 1]);
  let lastTieIndex = limit - 1;
  while (lastTieIndex + 1 < array.length && valueGetter(array[lastTieIndex + 1]) === cutoffValue) {
    lastTieIndex++;
  }
  return array.slice(0, lastTieIndex + 1);
}

function compressYearRanges(sortedYears) {
  if (!sortedYears || sortedYears.length === 0) return [];
  const formatYear = (year) => year.toString();
  if (sortedYears.length === 1) return [formatYear(sortedYears[0])];
  const ranges = [];
  let rangeStart = sortedYears[0];
  for (let i = 1; i < sortedYears.length; i++) {
    const prevY = Number(sortedYears[i-1]);
    const currY = Number(sortedYears[i]);
    const isConsecutive = (currY === prevY + 1);
    if (!isConsecutive) {
      const rangeEnd = sortedYears[i-1];
      if (rangeStart == rangeEnd) ranges.push(formatYear(rangeStart));
      else ranges.push(`${formatYear(rangeStart)}-${formatYear(rangeEnd)}`);
      rangeStart = sortedYears[i];
    }
  }
  const finalRangeEnd = sortedYears[sortedYears.length - 1];
  if (rangeStart == finalRangeEnd) ranges.push(formatYear(rangeStart));
  else ranges.push(`${formatYear(rangeStart)}-${formatYear(finalRangeEnd)}`);
  return ranges;
}

function compressMonthRanges(sortedMonths) {
  if (!sortedMonths || sortedMonths.length === 0) return [];
  const formatMonth = (monthStr) => { const [y, m] = monthStr.split('-'); return `${m.padStart(2, '0')}/${y}`; };
  if (sortedMonths.length === 1) return [formatMonth(sortedMonths[0])];
  const ranges = [];
  let rangeStart = sortedMonths[0];
  for (let i = 1; i < sortedMonths.length; i++) {
    const [prevY, prevM] = sortedMonths[i-1].split('-').map(Number);
    const [currY, currM] = sortedMonths[i].split('-').map(Number);
    const isConsecutive = (prevY === currY && currM === prevM + 1) || (currY === prevY + 1 && prevM === 12 && currM === 1);
    if (!isConsecutive) {
      const rangeEnd = sortedMonths[i-1];
      if (rangeStart === rangeEnd) ranges.push(formatMonth(rangeStart));
      else ranges.push(`${formatMonth(rangeStart)}-${formatMonth(rangeEnd)}`);
      rangeStart = sortedMonths[i];
    }
  }
  const finalRangeEnd = sortedMonths[sortedMonths.length - 1];
  if (rangeStart === finalRangeEnd) ranges.push(formatMonth(rangeStart));
  else ranges.push(`${formatMonth(rangeStart)}-${formatMonth(finalRangeEnd)}`);
  return ranges;
}

function getYearlyBests(type, sourceData, metricKey, dateKeyOrYearlyStats) {
  const bests = {};
  const years = [];

  const getYear = (obj, key) => {
    if (!obj || !obj[key]) return null;
    const val = obj[key];
    if (val instanceof Date) return val.getFullYear();
    if (typeof val === 'string') return new Date(val).getFullYear();
    return null;
  };

  const getMetricValue = (obj, key) => {
    if (!obj || !key) return 0;
    if (key.endsWith('.size')) {
      const propName = key.split('.')[0]; 
      if (obj[propName] instanceof Set) return obj[propName].size;
    }
    if (!key.includes('.')) return obj[key] || 0;
    try {
      let value = obj;
      for (const k of key.split('.')) value = value[k];
      return value || 0;
    } catch (e) { return 0; }
  };
  
  if (type === 'event') {
    if (!Array.isArray(sourceData)) return [];
    sourceData.forEach(item => {
      const year = getYear(item, dateKeyOrYearlyStats);
      if (!year) return;
      const val = getMetricValue(item, metricKey); 
      if (!bests[year] || val > bests[year].val) {
        bests[year] = { items: [item], val: val };
      } else if (val === bests[year].val && val > 0) { 
        bests[year].items.push(item);
      }
    });
    Object.keys(bests).forEach(y => years.push(parseInt(y)));
    return years.sort((a, b) => b - a).flatMap(year => {
        if (!bests[year]) return [];
        return bests[year].items.map(item => ({ year: year, data: item, isTie: bests[year].items.length > 1 }))
    });
  } 
  else if (type === 'stats') {
    const yearlyStats = dateKeyOrYearlyStats || {};
    for (const year in yearlyStats) {
      let topNames = []; let topVal = -1; let topObjs = []; 
      const yearData = yearlyStats[year];
      if (!yearData) continue;
      for (const name in yearData) {
          const entry = yearData[name];
          const val = getMetricValue(entry, metricKey); 
          if (val > topVal) topVal = val;
      }
      if (topVal > 0) { 
          for (const name in yearData) {
              const entry = yearData[name];
              const val = getMetricValue(entry, metricKey); 
              if (val === topVal) {
                  topNames.push(name);
                  topObjs.push(entry);
              }
          }
      }
      if (topNames.length > 0) {
        for (let j = 0; j < topNames.length; j++) {
            const topName = topNames[j];
            const topObj = topObjs[j];
            let minDate = null, maxDate = null;
            if (topObj.days && topObj.days.size > 0) {
              const sortedDays = [...topObj.days].sort();
              minDate = new Date(sortedDays[0] + 'T12:00:00Z');
              maxDate = new Date(sortedDays[sortedDays.length - 1] + 'T12:00:00Z');
            } else {
              minDate = topObj.firstDate || topObj.minDate || null;
              maxDate = topObj.lastDate || topObj.maxDate || null;
            }
            if (!bests[year]) { bests[year] = []; years.push(parseInt(year)); }
            bests[year].push({ 
                name: topName, value: topVal, games: topObj.games || new Set(), 
                minDate: minDate, maxDate: maxDate, systems: topObj.systems || new Set()
            });
        }
      }
    }
    return years.sort((a, b) => b - a).flatMap(year => {
        if (!bests[year]) return [];
        return bests[year].map(item => ({ year: year, data: item, isTie: bests[year].length > 1 }))
    });
  }
  return [];
}
