function safeStringify(val) {
  if (val === null || val === undefined) return "N/A";
  
  // If it's an object or array, convert structure to a clean string
  if (typeof val === 'object') {
    try {
      // Strips JSON brackets/quotes or formats array elements
      return JSON.stringify(val)
        .replace(/["{}\[\]]/g, '')  // Remove JSON noise
        .replace(/[:]/g, ': ')      // Format keys nicely
        .replace(/[,]/g, ' | ')     // Separate items cleanly
        .replace(/[\t\n\r]+/g, ' ') // Strip tabs/newlines for TSV safety
        .trim() || "N/A";
    } catch (e) {
      return String(val);
    }
  }

  // If it's a primitive (string, number, boolean), cast to string & strip whitespace/newlines
  return String(val).replace(/[\t\n\r]+/g, ' ').trim() || "N/A";
}


// Helper Function: Formats and displays modal with sorting + CSV export
function displayResultsPopup(resultsArray, totalCourses) {
  const existing = document.getElementById("oncourse-overlay");
  if (existing) existing.remove();

  // Parse tab-separated strings into structured objects for easy sorting
  let parsedData = resultsArray.map(row => {
    const parts = row.split("\t");
    const code = parts[0] || "N/A";
    const title = parts[1] || "N/A";
    const isError = title.includes("HTTP") || title.includes("Error") || title.includes("Unavailable");
    
    return {
      raw: row,
      code: code,
      url: `https://www.oncourse.college/${encodeURIComponent(code)}`,
      title: title,
      units: parts[2] || "N/A",
      medianHrs: parts[3] || "N/A",
      meanHrs: isError || isNaN(parseFloat(parts[4])) ? Infinity : parseFloat(parts[4]),
      meanHrsStr: parts[4] || "N/A",
      medianGrade: parts[5] || "N/A",
      prereqs: parts[6] || "N/A",
      finalExam: parts[7] || "N/A",
      terms: parts[8] || "N/A",
      isError: isError
    };
  });

  const headers = [
    "Course Code", "Title", "Units", "Median Hrs", 
    "Mean Hrs", "Median Grade", "Prereqs", "Final Exam", "Terms/Schedules"
  ];

  const container = document.createElement("div");
  container.id = "oncourse-overlay";
  container.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 999999; background: #ffffff; border: 2px solid #0070f3;
    border-radius: 8px; padding: 20px; box-shadow: 0 12px 30px rgba(0,0,0,0.3);
    width: 90vw; max-width: 1100px; max-height: 85vh; display: flex;
    flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h3 style="margin: 0; font-size: 18px; color: #111;">Fetch Complete! (${parsedData.length} /${totalCourses} Processed)</h3>
      <button id="close-modal-btn" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #666;">&times;</button>
    </div>

    <!-- Sorting & Action Controls Bar -->
    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; background: #f7f9fa; padding: 10px; border-radius: 6px; border: 1px solid #eaeaea;">
      
      <!-- Term Priority Filter -->
      <label style="font-size: 13px; font-weight: bold; color: #333;">
        Prioritize Term:
        <select id="term-priority-select" style="padding: 5px 8px; font-size: 13px; border-radius: 4px; border: 1px solid #ccc; margin-left: 4px;">
          <option value="NONE">None (Default)</option>
          <option value="AUT">Autumn (AUT)</option>
          <option value="WIN">Winter (WIN)</option>
          <option value="SPR">Spring (SPR)</option>
          <option value="SUM">Summer (SUM)</option>
        </select>
      </label>

      <!-- Sort by Workload -->
      <label style="font-size: 13px; font-weight: bold; color: #333; margin-left: 10px;">
        Sort Workload:
        <select id="hrs-sort-select" style="padding: 5px 8px; font-size: 13px; border-radius: 4px; border: 1px solid #ccc; margin-left: 4px;">
          <option value="DEFAULT">Original Order</option>
          <option value="ASC">Mean Hours (Low → High)</option>
          <option value="DESC">Mean Hours (High → Low)</option>
        </select>
      </label>

      <div style="flex: 1;"></div>

      <!-- Action Buttons -->
      <button id="copy-btn" style="padding: 8px 14px; background: #0070f3; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px;">
        📋 Copy TSV
      </button>
      <button id="download-csv-btn" style="padding: 8px 14px; background: #107c41; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px;">
        📥 Download CSV
      </button>
      <button id="query-again-btn" style="padding: 8px 14px; background: #666; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px;">
        🔄 Query Again
      </button>
    </div>

    <!-- Table Container -->
    <div style="overflow: auto; flex: 1; border: 1px solid #ddd; border-radius: 4px;">
      <table style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            ${headers.map(h => `<th style="border: 1px solid #0070f3; background: #0070f3; color: white; padding: 8px; font-size: 12px; text-align: left; position: sticky; top: 0; z-index: 2;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody id="results-tbody"></tbody>
      </table>
    </div>
  `;

  document.body.appendChild(container);

  // Sorting Logic Handler
  function renderTable() {
    const selectedTerm = document.getElementById("term-priority-select").value;
    const hrsSort = document.getElementById("hrs-sort-select").value;

    const sorted = [...parsedData].sort((a, b) => {
      // Rule 1: Always push error/unavailable rows to the bottom
      if (a.isError && !b.isError) return 1;
      if (!a.isError && b.isError) return -1;

      // Rule 2: Term priority (moves selected term to top)
      if (selectedTerm !== "NONE") {
        const aHasTerm = a.terms.toUpperCase().includes(selectedTerm);
        const bHasTerm = b.terms.toUpperCase().includes(selectedTerm);
        if (aHasTerm && !bHasTerm) return -1;
        if (!aHasTerm && bHasTerm) return 1;
      }

      // Rule 3: Mean Hours Sorting
      if (hrsSort === "ASC") return a.meanHrs - b.meanHrs;
      if (hrsSort === "DESC") return b.meanHrs - a.meanHrs;

      return 0;
    });

    const tbody = document.getElementById("results-tbody");
    tbody.innerHTML = sorted.map(item => `
      <tr style="${item.isError ? 'background-color: #fff0f0; color: #a00;' : 'background-color: #ffffff; color: #222222;'}">
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; font-weight: bold; color: inherit;">
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" style="color: #0070f3; text-decoration: underline;">
            ${item.code}
          </a>
        </td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.title}</td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.units}</td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.medianHrs}</td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.meanHrsStr}</td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.medianGrade}</td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.prereqs}</td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.finalExam}</td>
        <td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; color: inherit;">${item.terms}</td>
      </tr>
    `).join('');
  }

  // Initial render
  renderTable();

  // Attach Sorting Listeners
  document.getElementById("term-priority-select").addEventListener("change", renderTable);
  document.getElementById("hrs-sort-select").addEventListener("change", renderTable);

  // CSV Download Handler (Correctly formats =HYPERLINK formula)
  document.getElementById("download-csv-btn").addEventListener("click", () => {
    const csvRows = [headers.join(",")];

    parsedData.forEach(item => {
      // Clean string concatenation prevents nested quote escaping bugs
      const hyperlinkFormula = '=HYPERLINK("' + item.url + '", "' + item.code + '")';

      const row = [
        hyperlinkFormula,
        item.title,
        item.units,
        item.medianHrs, 
        item.meanHrsStr,
        item.medianGrade,
        item.prereqs,
        item.finalExam,
        item.terms
      ].map(field => {
        const str = String(field);
        // Formulas starting with '=' must be wrapped in quotes for CSV
        if (str.startsWith('=')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return '"' + str.replace(/"/g, '""') + '"';
      });

      csvRows.push(row.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `oncourse_results_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });


  // Copy Clipboard Handler (Copies both Rich HTML & Plain TSV)
  document.getElementById("copy-btn").addEventListener("click", async () => {
    const tsvData = parsedData.map(d => d.raw).join("\n");
    
    // Construct HTML table so Google Sheets / Excel receive hyperlinked text on paste
    const htmlRows = parsedData.map(d => `
      <tr>
        <td><a href="${d.url}">${d.code}</a></td>
        <td>${d.title}</td>
        <td>${d.units}</td>
        <td>${d.medianHrs}</td>
        <td>${d.meanHrsStr}</td>
        <td>${d.medianGrade}</td>
        <td>${d.prereqs}</td>
        <td>${d.finalExam}</td>
        <td>${d.terms}</td>
      </tr>
    `).join('');
    const htmlTable = `<table><tbody>${htmlRows}</tbody></table>`;

    try {
      const blobText = new Blob([tsvData], { type: 'text/plain' });
      const blobHtml = new Blob([htmlTable], { type: 'text/html' });
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': blobText,
          'text/html': blobHtml
        })
      ]);
      alert("✅ Copied data with clickable links to clipboard!");
    } catch (e) {
      // Fallback if rich clipboard access fails
      await navigator.clipboard.writeText(tsvData);
      alert("✅ Copied plain TSV to clipboard!");
    }
  });

  // Query Again Handler
  document.getElementById("query-again-btn").addEventListener("click", () => {
    container.remove();
    if (typeof queryCourses === "function") queryCourses();
  });

  // Close Button Handler
  document.getElementById("close-modal-btn").addEventListener("click", () => container.remove());
}


// Helper to create or update centered progress UI modal
function updateProgressUI(current, total, message, isFinished = false) {
  let overlay = document.getElementById('fetcher-progress-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fetcher-progress-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.65); z-index: 999999;
      display: flex; justify-content: center; align-items: center;
      font-family: system-ui, sans-serif;
    `;

    const modalContent = document.createElement('div');
    modalContent.id = 'fetcher-progress-content';
    modalContent.style.cssText = `
      background: #1e1e1e; color: #fff; padding: 20px; border-radius: 8px;
      width: 480px; max-width: 90%; display: flex; flex-direction: column;
      gap: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-family: monospace;
    `;
    
    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);
  }

  const modalContent = overlay.querySelector('#fetcher-progress-content');
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  modalContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;">
      <span>${isFinished ? '✅ Fetch Complete' : '⏳ Fetching Course Data...'}</span>
      <span style="color:#2196F3;">${percent}%</span>
    </div>
    
    <!-- Progress Bar Track -->
    <div style="width:100%;background:#111;height:10px;border-radius:5px;overflow:hidden;border:1px solid #333;">
      <div style="width:${percent}%;background:#2196F3;height:100%;transition:width 0.15s ease;"></div>
    </div>
    
    <!-- Status & Details -->
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#aaa;">
      <span id="fetcher-log-text" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80%;">
        ${message}
      </span>
      <span>${current} / ${total}</span>
    </div>
  `;
  if (isFinished) {   
    setTimeout(() => {const existingOverlay = document.getElementById('fetcher-progress-overlay'); if (existingOverlay) { existingOverlay.remove(); }}, 500); // Quick fade-out before opening the results modal
  }

}

// Main Fetcher Function
async function fetchAllCourses(courses, year, quarter) {
  const log = (msg) => {
    console.log(msg);
  };

  log(`Starting fetch for ${courses.length} courses...`);
  updateProgressUI(0, courses.length, `Initializing fetch for ${courses.length} courses...`);

  const results = [];

  for (let i = 0; i < courses.length; i++) {
    const rawCode = courses[i].split(" - ")[0].trim();
    const cleanCode = rawCode.replace(/\s+/g, '').toUpperCase();
    const isFinished = i==courses.length-1;
    if (!cleanCode) {
      updateProgressUI(i + 1, courses.length, `Skipping empty code...`, isFinished);
      continue;
    }

    const currentNum = i + 1;
    const progressMsg = `Fetching ${cleanCode}...`;
    updateProgressUI(currentNum, courses.length, progressMsg, isFinished);

    try {
      const response = await fetch(`https://www.oncourse.college/api/course/detail?courseId=${cleanCode}&quarter=${year}-${quarter}&fallbackAny=true`, {
        headers: { "Accept": "application/json" }
      });

      if (response.ok) {
        const json = await response.json();
        const data = json.data;

        if (data) {
          const title = safeStringify(data.title);
          
          let units = "N/A";
          const min = data.units_min;
          const max = data.units_max;

          if (min !== null && min !== undefined) {
            if (max !== null && max !== undefined && max !== min) {
              units = min + "-" + max;
            } else {
              units = String(min);
            }
          }

          const medianHrs = safeStringify(data.median_hours);
          const meanHrs = safeStringify(data.mean_hours);
          const medianGrade = safeStringify(data.median_grade);
          const prereqs = safeStringify(data.prereqs);
          const finalExam = safeStringify(data.final_exam);
          const qtrDesc = safeStringify(data.qtrDesc || data.schedules || data.terms);

          results.push([cleanCode, title, units, medianHrs, meanHrs, medianGrade, prereqs, finalExam, qtrDesc].join("\t"));
        } else {
          results.push([cleanCode, "Unavailable", "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "N/A"].join("\t"));
        }
      } else {
        results.push([cleanCode, `HTTP ${response.status}`, "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "N/A"].join("\t"));
      }
    } catch (e) {
      results.push([cleanCode, "Fetch Error", "N/A", "N/A", "N/A", "N/A", "N/A", "N/A", "N/A"].join("\t"));
    }

    // 150ms delay between requests
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  log("SUCCESS! Completed fetching.");
  // Display pop-up helper function
  displayResultsPopup(results, courses.length);
}


// 1. UI Component (Renders modal, handles UI state, returns a Promise with raw data)
function showCourseModal() {
  return new Promise(resolve => {
    const oldModal = document.getElementById('course-input-modal');
    if (oldModal) oldModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'course-input-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.65);z-index:999999;display:flex;justify-content:center;align-items:center;font-family:system-ui, sans-serif;';
    
    // Inject custom styling for placeholder darkness and selects
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      #p-text::placeholder {
        color: #b0b0b0;
        font-style: italic;
        opacity: 1;
      }
      .modal-select {
        flex: 1;
        background: #2d2d2d;
        color: #fff;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 8px 10px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
      }
      .modal-select:focus {
        border-color: #2196F3;
      }
    `;
    overlay.appendChild(styleTag);

    // Generate School Year Options dynamically (current year up to 10 years ahead)
    const now = new Date();
    const realYear = now.getFullYear();
    const month = now.getMonth(); // 0 = Jan, 8 = Sep, 11 = Dec

    // September (month 8) through December (month 11): use real year
    // January (month 0) through August (month 7): use real year - 1
    const currentYear = month >= 8 ? realYear : realYear - 1;

    let yearOptions = '';
    for (let i = -3; i < 2; i++) {
      const startYear = currentYear + i;
      const yrStr = `${startYear}-${startYear + 1}`;
  
      // Pre-select when i === 0 (which now represents the current academic year)
      const isSelected = i === 0 ? 'selected' : '';
  
      yearOptions += `<option value="${yrStr}" ${isSelected}>${yrStr}</option>`;
    }

    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background:#1e1e1e;color:#fff;padding:20px;border-radius:8px;width:480px;max-width:90%;display:flex;flex-direction:column;gap:14px;box-shadow:0 8px 24px rgba(0,0,0,0.5);';
    modalContent.innerHTML = `
      <div style="display:flex;gap:10px;">
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;color:#aaa;font-weight:600;">School Year</label>
          <select id="p-year" class="modal-select">
            ${yearOptions}
          </select>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;color:#aaa;font-weight:600;">Quarter</label>
          <select id="p-quarter" class="modal-select">
            <option value="0" selected>Autumn</option>
            <option value="1">Winter</option>
            <option value="2">Spring</option>
            <option value="3">Summer</option>
          </select>
        </div>
      </div>

      <label style="font-size:14px;font-weight:600;margin-top:4px;">Paste Course List:</label>
      
      <div style="display:flex;gap:8px;background:#111;padding:4px;border-radius:6px;border:1px solid #333;">
        <label id="lbl-line" style="flex:1;text-align:center;padding:8px 12px;font-size:12px;border-radius:4px;cursor:pointer;background:#2196F3;color:#fff;font-weight:600;transition:all 0.2s;">
          <input type="radio" name="splitMode" value="line" checked style="display:none;">
          By Line
        </label>
        <label id="lbl-comma" style="flex:1;text-align:center;padding:8px 12px;font-size:12px;border-radius:4px;cursor:pointer;background:transparent;color:#888;font-weight:500;transition:all 0.2s;">
          <input type="radio" name="splitMode" value="comma" style="display:none;">
          By Comma
        </label>
      </div>

      <textarea id="p-text" rows="8" style="width:100%;box-sizing:border-box;background:#2d2d2d;color:#fff;border:1px solid #444;border-radius:4px;padding:10px;font-family:monospace;font-size:13px;resize:vertical;"></textarea>
      
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button id="p-cancel" style="padding:6px 14px;background:#444;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
        <button id="p-submit" style="padding:6px 14px;background:#2196F3;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;">Submit</button>
      </div>
    `;

    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);

    const area = overlay.querySelector('#p-text');
    const lblLine = overlay.querySelector('#lbl-line');
    const lblComma = overlay.querySelector('#lbl-comma');
    const radios = overlay.querySelectorAll('input[name="splitMode"]');

    const placeholders = {
      line: "CS 205L - Continuous Mathematical Methods with an Emphasis on Machine Learning (3 credits)\nCS 223A\nCS 225A - Experimental Robotics",
      comma: "CS101, CS102, ARTSTUDI101"
    };

    const updateUI = (selectedMode) => {
      const isLine = selectedMode === 'line';
      lblLine.style.cssText = `flex:1;text-align:center;padding:8px 12px;font-size:12px;border-radius:4px;cursor:pointer;transition:all 0.2s;${isLine ? 'background:#2196F3;color:#fff;font-weight:600;' : 'background:transparent;color:#888;font-weight:500;'}`;
      lblComma.style.cssText = `flex:1;text-align:center;padding:8px 12px;font-size:12px;border-radius:4px;cursor:pointer;transition:all 0.2s;${!isLine ? 'background:#2196F3;color:#fff;font-weight:600;' : 'background:transparent;color:#888;font-weight:500;'}`;
      area.placeholder = "Example:\n"+placeholders[selectedMode];
    };

    radios.forEach(r => r.addEventListener('change', (e) => updateUI(e.target.value)));
    updateUI('line');
    area.focus();

    const close = (val) => { overlay.remove(); resolve(val); };
    
  overlay.querySelector('#p-submit').onclick = () => {
    const mode = overlay.querySelector('input[name="splitMode"]:checked').value;
    const rawYear = overlay.querySelector('#p-year').value; // "2026-2027"
  
    // Extract just the first 4-digit year as an integer (or leave off parseInt for a string "2026")
    const year = parseInt(rawYear.split('-')[0], 10); 
    const quarter = parseInt(overlay.querySelector('#p-quarter').value, 10);

  close({ text: area.value, mode, year, quarter });
  };

    overlay.querySelector('#p-cancel').onclick = () => close(null);
  });
}

// 2. Data Parser Pure Function
function parseCourseList(text, mode) {
  const delimiter = mode === 'line' ? '\n' : ',';
  const rawList = text
    .split(delimiter)
    .map(item => item.trim())
    .filter(Boolean);

  return [...new Set(rawList)];
}

// 3. Orchestrator Function
async function queryCourses() {
  const modalResult = await showCourseModal();

  if (!modalResult || !modalResult.text.trim()) {
    console.warn("No input provided.");
    return [];
  }

  const uniqueCourses = parseCourseList(modalResult.text, modalResult.mode);
  window["courseList"] = uniqueCourses;

  console.log(`%c Received ${uniqueCourses.lengthcourses}(${modalResult.mode} mode):`, 'color: #4CAF50; font-weight: bold;');
  console.log(uniqueCourses);

  return await fetchAllCourses(uniqueCourses, modalResult.year, modalResult.quarter);
}



queryCourses();

