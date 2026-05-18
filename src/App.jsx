import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

const IconBase = ({ children, className = '' }) => (
  <span className={`inline-flex items-center justify-center ${className}`}>{children}</span>
);

const Save = (p) => <IconBase {...p}>💾</IconBase>;
const Upload = (p) => <IconBase {...p}>⬆</IconBase>;
const Download = (p) => <IconBase {...p}>⬇</IconBase>;
const Printer = (p) => <IconBase {...p}>🖨</IconBase>;
const Undo2 = (p) => <IconBase {...p}>↩</IconBase>;
const Wand2 = (p) => <IconBase {...p}>✨</IconBase>;
const Eye = (p) => <IconBase {...p}>👁</IconBase>;
const Users = (p) => <IconBase {...p}>👥</IconBase>;
const UserPlus = (p) => <IconBase {...p}>＋</IconBase>;
const AlertTriangle = (p) => <IconBase {...p}>⚠</IconBase>;
const Lock = (p) => <IconBase {...p}>🔒</IconBase>;
const Trash2 = (p) => <IconBase {...p}>🗑</IconBase>;
const X = (p) => <IconBase {...p}>×</IconBase>;
const Plus = (p) => <IconBase {...p}>＋</IconBase>;
const Edit2 = (p) => <IconBase {...p}>✎</IconBase>;
const Check = (p) => <IconBase {...p}>✓</IconBase>;
const GraduationCap = (p) => <IconBase {...p}>教</IconBase>;
const RotateCcw = (p) => <IconBase {...p}>↻</IconBase>;
const Settings = (p) => <IconBase {...p}>⚙</IconBase>;
const Pencil = (p) => <IconBase {...p}>✎</IconBase>;
const FileJson = (p) => <IconBase {...p}>JSON</IconBase>;
const RefreshCw = (p) => <IconBase {...p}>↻</IconBase>;
const ListChecks = (p) => <IconBase {...p}>☑</IconBase>;
const PenLine = (p) => <IconBase {...p}>✎</IconBase>;
const Layers = (p) => <IconBase {...p}>▦</IconBase>;
const ChevronDown = (p) => <IconBase {...p}>▼</IconBase>;
const ChevronUp = (p) => <IconBase {...p}>▲</IconBase>;
const MonitorSmartphone = (p) => <IconBase {...p}>📱</IconBase>;
const Armchair = (p) => <IconBase {...p}>席</IconBase>;

/* ==========================================================================
   席替えサポート（Seat Arrangement Support）
   - React + Tailwind (single file MVP)
   - localStorage 自動保存 / JSON エクスポート・インポート
   - iPad / PC / スマホ レスポンシブ、タッチドラッグ対応
   - A4 横印刷対応
   ========================================================================== */

const STORAGE_KEY = 'seat-arrangement-app:v1';

/* --- Safe localStorage wrapper -------------------------------------------- */
const safeStorage = {
  get() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  set(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  },
  remove() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  },
  available() {
    try {
      window.localStorage.setItem('__test__', '1');
      window.localStorage.removeItem('__test__');
      return true;
    } catch (e) { return false; }
  }
};

/* --- ID generator --------------------------------------------------------- */
let _uid = 0;
const uid = (prefix = 's') =>
  `${prefix}_${Date.now().toString(36)}_${(_uid++).toString(36)}`;

/* --- Helpers -------------------------------------------------------------- */
const makeLayout = (rows, cols) =>
  Array.from({ length: rows }, () => Array(cols).fill(null));

const defaultData = () => ({
  className: '',
  rows: 5,
  cols: 6,
  students: [],
  seats: [],            // [{row, col, disabled}]（使用不可席のみを保持）
  considerations: [],   // [{studentId, preferFront, ...}]
  currentLayout: null   // 2D array of studentId | null
});

const disabledSetFromSeats = (seats) =>
  new Set(seats.filter(s => s.disabled).map(s => `${s.row},${s.col}`));

function normalizeLayout(layout, rows, cols, students) {
  const out = makeLayout(rows, cols);
  if (!layout) return out;
  const valid = new Set(students.map(s => s.id));
  const placed = new Set();
  for (let r = 0; r < Math.min(rows, layout.length); r++) {
    const rowArr = layout[r];
    if (!rowArr) continue;
    for (let c = 0; c < Math.min(cols, rowArr.length); c++) {
      const sid = rowArr[c];
      if (sid && valid.has(sid) && !placed.has(sid)) {
        out[r][c] = sid;
        placed.add(sid);
      }
    }
  }
  return out;
}

function ensureConsideration(considerations, studentId) {
  const existing = considerations.find(c => c.studentId === studentId);
  if (existing) return existing;
  return {
    studentId,
    preferFront: false, preferBack: false,
    preferLeft: false, preferRight: false,
    preferNearTeacherDesk: false, fixed: false,
    avoidAdjacentStudentIds: [],
    avoidNearbyStudentIds: []
  };
}

/* --- 自動配置 -------------------------------------------------------------- */
function autoArrange(students, rows, cols, disabledSet, considerations, currentLayout) {
  const grid = makeLayout(rows, cols);
  const consMap = new Map(considerations.map(c => [c.studentId, c]));
  const placed = new Set();

  const currentPos = new Map();
  if (currentLayout) {
    for (let r = 0; r < currentLayout.length; r++) {
      const row = currentLayout[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c]) currentPos.set(row[c], [r, c]);
      }
    }
  }

  // 1) 固定席：現在位置にロック
  for (const student of students) {
    const cons = consMap.get(student.id);
    if (cons?.fixed) {
      const pos = currentPos.get(student.id);
      if (pos && pos[0] < rows && pos[1] < cols && !disabledSet.has(`${pos[0]},${pos[1]}`)) {
        grid[pos[0]][pos[1]] = student.id;
        placed.add(student.id);
      }
    }
  }

  // 2) 制約の強い生徒から順に配置
  const remaining = students.filter(s => !placed.has(s.id));
  const constraintScore = (c) => {
    if (!c) return 0;
    return (c.preferFront ? 1 : 0) + (c.preferBack ? 1 : 0) +
           (c.preferLeft ? 1 : 0) + (c.preferRight ? 1 : 0) +
           (c.preferNearTeacherDesk ? 3 : 0) +
           (c.avoidAdjacentStudentIds?.length || 0) * 1.5 +
           (c.avoidNearbyStudentIds?.length || 0) * 0.7;
  };
  remaining.sort((a, b) =>
    constraintScore(consMap.get(b.id)) - constraintScore(consMap.get(a.id))
  );

  // 3) 各生徒に最良席を割り当て
  for (const student of remaining) {
    const cons = consMap.get(student.id);
    let bestSeat = null;
    let bestScore = -Infinity;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (disabledSet.has(`${r},${c}`)) continue;
        if (grid[r][c] !== null) continue;

        let score = 1 + Math.random() * 0.1; // tie-break

        if (cons) {
          if (cons.preferFront) score += (rows - 1 - r) * 3;
          if (cons.preferBack)  score += r * 3;
          if (cons.preferLeft)  score += (cols - 1 - c) * 3;
          if (cons.preferRight) score += c * 3;
          if (cons.preferNearTeacherDesk) {
            const colCenter = (cols - 1) / 2;
            score += (rows - 1 - r) * 4 - Math.abs(c - colCenter) * 2;
          }
          // 隣NG
          if (cons.avoidAdjacentStudentIds?.length) {
            for (const dc of [-1, 1]) {
              const nc = c + dc;
              if (nc >= 0 && nc < cols && cons.avoidAdjacentStudentIds.includes(grid[r][nc])) {
                score -= 250;
              }
            }
          }
          // 近くNG（8マス）
          if (cons.avoidNearbyStudentIds?.length) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                    cons.avoidNearbyStudentIds.includes(grid[nr][nc])) {
                  score -= 120;
                }
              }
            }
          }
        }

        // 既に配置済みの他生徒が「この生徒を避けたい」と指定している場合
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc >= 0 && nc < cols && grid[r][nc]) {
            const oc = consMap.get(grid[r][nc]);
            if (oc?.avoidAdjacentStudentIds?.includes(student.id)) score -= 250;
          }
        }
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc]) {
              const oc = consMap.get(grid[nr][nc]);
              if (oc?.avoidNearbyStudentIds?.includes(student.id)) score -= 120;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestSeat = [r, c];
        }
      }
    }

    if (bestSeat) {
      grid[bestSeat[0]][bestSeat[1]] = student.id;
      placed.add(student.id);
    }
  }
  return grid;
}

/* --- 警告生成 -------------------------------------------------------------- */
function getWarnings(layout, students, rows, cols, considerations, disabledSet) {
  const warnings = [];
  const studentMap = new Map(students.map(s => [s.id, s]));

  const availableSeats = rows * cols - disabledSet.size;
  if (students.length > availableSeats) {
    warnings.push({
      key: 'capacity',
      severity: 'error',
      message: `名簿人数（${students.length}人）に対して使用可能席（${availableSeats}席）が不足しています`
    });
  }

  const positions = new Map();
  if (layout) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sid = layout[r]?.[c];
        if (!sid) continue;
        positions.set(sid, [r, c]);
        if (disabledSet.has(`${r},${c}`)) {
          const s = studentMap.get(sid);
          warnings.push({
            key: `disabled-${sid}`,
            severity: 'error',
            message: `使用不可席に${s?.name ?? ''}さんが配置されています`
          });
        }
      }
    }
  }

  for (const s of students) {
    if (!positions.has(s.id)) {
      warnings.push({
        key: `unplaced-${s.id}`,
        severity: 'warn',
        message: `${s.name}さんが未配置です`
      });
    }
  }

  const halfRow = rows / 2;
  const halfCol = cols / 2;

  for (const cons of considerations) {
    const student = studentMap.get(cons.studentId);
    if (!student) continue;
    const pos = positions.get(cons.studentId);
    if (!pos) continue;
    const [r, c] = pos;

    if (cons.preferFront && r >= halfRow) {
      warnings.push({ key: `pref-front-${cons.studentId}`, severity: 'warn',
        message: `${student.name}さんは前方希望ですが後方寄りに配置されています` });
    }
    if (cons.preferBack && r < halfRow) {
      warnings.push({ key: `pref-back-${cons.studentId}`, severity: 'warn',
        message: `${student.name}さんは後方希望ですが前方寄りに配置されています` });
    }
    if (cons.preferLeft && c >= halfCol) {
      warnings.push({ key: `pref-left-${cons.studentId}`, severity: 'warn',
        message: `${student.name}さんは左側希望ですが右側寄りに配置されています` });
    }
    if (cons.preferRight && c < halfCol) {
      warnings.push({ key: `pref-right-${cons.studentId}`, severity: 'warn',
        message: `${student.name}さんは右側希望ですが左側寄りに配置されています` });
    }
    if (cons.preferNearTeacherDesk) {
      const colCenter = (cols - 1) / 2;
      const okRow = r <= Math.floor((rows - 1) / 3);
      const okCol = Math.abs(c - colCenter) <= Math.max(1, Math.floor(cols / 3));
      if (!okRow || !okCol) {
        warnings.push({ key: `pref-td-${cons.studentId}`, severity: 'warn',
          message: `${student.name}さんは教卓近く希望ですが離れて配置されています` });
      }
    }

    if (cons.avoidAdjacentStudentIds?.length) {
      for (const oid of cons.avoidAdjacentStudentIds) {
        const op = positions.get(oid);
        if (!op) continue;
        if (op[0] === r && Math.abs(op[1] - c) === 1) {
          const other = studentMap.get(oid);
          const ids = [cons.studentId, oid].sort().join('-');
          warnings.push({ key: `adj-${ids}`, severity: 'error',
            message: `${student.name}さんと${other?.name}さんが隣同士になっています` });
        }
      }
    }
    if (cons.avoidNearbyStudentIds?.length) {
      for (const oid of cons.avoidNearbyStudentIds) {
        const op = positions.get(oid);
        if (!op) continue;
        const dr = Math.abs(op[0] - r), dc = Math.abs(op[1] - c);
        if (dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0)) {
          const other = studentMap.get(oid);
          const ids = [cons.studentId, oid].sort().join('-');
          warnings.push({ key: `near-${ids}`, severity: 'warn',
            message: `${student.name}さんと${other?.name}さんが近く（8マス以内）に配置されています` });
        }
      }
    }
  }

  // dedupe
  const seen = new Set();
  return warnings.filter(w => {
    if (seen.has(w.key)) return false;
    seen.add(w.key);
    return true;
  });
}

/* === Main Component ======================================================= */
export default function SeatArrangementApp() {
  const [data, setData] = useState(() => {
    const saved = safeStorage.get();
    if (saved && typeof saved === 'object') {
      const merged = { ...defaultData(), ...saved };
      merged.currentLayout = merged.currentLayout
        ? normalizeLayout(merged.currentLayout, merged.rows, merged.cols, merged.students)
        : null;
      return merged;
    }
    return defaultData();
  });

  const [viewMode, setViewMode] = useState('edit'); // edit | student | teacher | print
  const [activeTab, setActiveTab] = useState('layout');
  const [deleteSeatMode, setDeleteSeatMode] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [history, setHistory] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile/tablet collapsible
  const [savedFlash, setSavedFlash] = useState(false);

  const fileInputRef = useRef(null);

  /* --- Auto-save -------------------------------------------------------- */
  useEffect(() => {
    if (safeStorage.set(data)) {
      setSavedFlash(true);
      const t = setTimeout(() => setSavedFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [data]);

  /* --- Derived ---------------------------------------------------------- */
  const disabledSet = useMemo(() => disabledSetFromSeats(data.seats), [data.seats]);
  const layout = data.currentLayout || makeLayout(data.rows, data.cols);
  const warnings = useMemo(() => getWarnings(
    data.currentLayout, data.students, data.rows, data.cols, data.considerations, disabledSet
  ), [data, disabledSet]);

  /* --- History helpers -------------------------------------------------- */
  const update = useCallback((updater) => {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setHistory(h => [...h.slice(-29), prev]);
      return next;
    });
  }, []);

  const updateNoHistory = useCallback((updater) => {
    setData(prev => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setData(prev);
      return h.slice(0, -1);
    });
  }, []);

  /* --- Students --------------------------------------------------------- */
  const addStudent = (input) => {
    const number = input.number?.trim() || '';
    const name = input.name?.trim() || '';
    const kana = input.kana?.trim() || '';
    const gender = input.gender || '';
    if (!name) return;
    update(d => ({
      ...d,
      students: [...d.students, { id: uid('st'), number, name, kana, gender }]
    }));
  };

  const updateStudent = (id, patch) => {
    update(d => ({
      ...d,
      students: d.students.map(s => s.id === id ? { ...s, ...patch } : s)
    }));
  };

  const deleteStudent = (id) => {
    update(d => {
      const students = d.students.filter(s => s.id !== id);
      const considerations = d.considerations
        .filter(c => c.studentId !== id)
        .map(c => ({
          ...c,
          avoidAdjacentStudentIds: c.avoidAdjacentStudentIds?.filter(x => x !== id) || [],
          avoidNearbyStudentIds: c.avoidNearbyStudentIds?.filter(x => x !== id) || []
        }));
      let currentLayout = d.currentLayout;
      if (currentLayout) {
        currentLayout = currentLayout.map(row => row.map(sid => sid === id ? null : sid));
      }
      return { ...d, students, considerations, currentLayout };
    });
    if (selectedStudentId === id) setSelectedStudentId(null);
  };

  const bulkAddFromCSV = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const newStudents = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map(p => p.trim());
      if (parts.length < 2) continue;
      newStudents.push({
        id: uid('st'),
        number: parts[0] || '',
        name: parts[1] || '',
        kana: parts[2] || '',
        gender: parts[3] || ''
      });
    }
    if (newStudents.length === 0) return 0;
    update(d => ({ ...d, students: [...d.students, ...newStudents] }));
    return newStudents.length;
  };

  /* --- Seats / Layout --------------------------------------------------- */
  const setRows = (rows) => {
    update(d => {
      const r = Math.max(1, Math.min(20, parseInt(rows, 10) || 1));
      const currentLayout = d.currentLayout
        ? normalizeLayout(d.currentLayout, r, d.cols, d.students) : null;
      const seats = d.seats.filter(s => s.row < r);
      return { ...d, rows: r, currentLayout, seats };
    });
  };
  const setCols = (cols) => {
    update(d => {
      const c = Math.max(1, Math.min(20, parseInt(cols, 10) || 1));
      const currentLayout = d.currentLayout
        ? normalizeLayout(d.currentLayout, d.rows, c, d.students) : null;
      const seats = d.seats.filter(s => s.col < c);
      return { ...d, cols: c, currentLayout, seats };
    });
  };

  const toggleDisabled = (row, col) => {
    update(d => {
      const key = `${row},${col}`;
      const exists = d.seats.find(s => s.row === row && s.col === col);
      let seats;
      if (exists) {
        seats = exists.disabled
          ? d.seats.filter(s => !(s.row === row && s.col === col))
          : d.seats.map(s => s.row === row && s.col === col ? { ...s, disabled: true } : s);
      } else {
        seats = [...d.seats, { row, col, disabled: true }];
      }
      // disabled になった席に生徒がいたら追い出す
      let currentLayout = d.currentLayout;
      if (currentLayout && currentLayout[row]?.[col]) {
        currentLayout = currentLayout.map((rowArr, r) =>
          rowArr.map((sid, c) => (r === row && c === col) ? null : sid)
        );
      }
      return { ...d, seats, currentLayout };
    });
  };

  const resetDisabledSeats = () => {
    if (!window.confirm('使用不可席をすべてリセットします。よろしいですか？')) return;
    update(d => ({ ...d, seats: [] }));
  };

  const clearLayout = () => {
    if (!window.confirm('座席配置を初期化します（生徒を全員席から外します）。よろしいですか？')) return;
    update(d => ({ ...d, currentLayout: makeLayout(d.rows, d.cols) }));
  };

  /* --- Drag and Drop (pointer events, touch + mouse) -------------------- */
  const [dragState, setDragState] = useState(null);
  // dragState: { studentId, fromRow, fromCol, ghostX, ghostY, originRect }
  const pendingDragRef = useRef(null);
  const longPressTimerRef = useRef(null);

  // Global pointer move/up handlers while dragging
  useEffect(() => {
    if (!dragState) return;
    const onMove = (e) => {
      setDragState(s => s ? { ...s, ghostX: e.clientX, ghostY: e.clientY } : null);
    };
    const onUp = (e) => {
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const cell = elem?.closest('[data-seat]');
      if (cell) {
        const toRow = parseInt(cell.dataset.row, 10);
        const toCol = parseInt(cell.dataset.col, 10);
        handleDrop(dragState.fromRow, dragState.fromCol, toRow, toCol);
      }
      setDragState(null);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragState]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginDrag = (studentId, fromRow, fromCol, x, y) => {
    setDragState({ studentId, fromRow, fromCol, ghostX: x, ghostY: y });
    try { navigator.vibrate?.(20); } catch (e) {}
  };

  const handleSeatPointerDown = (e, row, col) => {
    if (viewMode !== 'edit') return;
    if (deleteSeatMode) {
      toggleDisabled(row, col);
      return;
    }
    const studentId = layout[row]?.[col];
    if (!studentId) return;

    setSelectedStudentId(studentId);

    const isTouch = e.pointerType === 'touch';
    const startX = e.clientX;
    const startY = e.clientY;

    // 固定席は移動禁止
    const cons = data.considerations.find(c => c.studentId === studentId);
    if (cons?.fixed) return;

    pendingDragRef.current = { studentId, fromRow: row, fromCol: col, startX, startY };

    if (isTouch) {
      // 長押し300msでドラッグ開始
      longPressTimerRef.current = setTimeout(() => {
        const p = pendingDragRef.current;
        if (p) beginDrag(p.studentId, p.fromRow, p.fromCol, p.startX, p.startY);
        longPressTimerRef.current = null;
      }, 300);

      const cancelOnMove = (ev) => {
        const p = pendingDragRef.current;
        if (!p) return;
        const dx = ev.clientX - p.startX;
        const dy = ev.clientY - p.startY;
        if (Math.hypot(dx, dy) > 10 && longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
          pendingDragRef.current = null;
        }
      };
      const cancelAll = () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        pendingDragRef.current = null;
        window.removeEventListener('pointermove', cancelOnMove);
        window.removeEventListener('pointerup', cancelAll);
        window.removeEventListener('pointercancel', cancelAll);
      };
      window.addEventListener('pointermove', cancelOnMove, { passive: true });
      window.addEventListener('pointerup', cancelAll);
      window.addEventListener('pointercancel', cancelAll);
    } else {
      // マウスは即時ドラッグ
      beginDrag(studentId, row, col, startX, startY);
    }
  };

  const handleDrop = (fromRow, fromCol, toRow, toCol) => {
    if (fromRow === toRow && fromCol === toCol) return;
    if (disabledSet.has(`${toRow},${toCol}`)) return;

    update(d => {
      const newLayout = d.currentLayout
        ? d.currentLayout.map(row => [...row])
        : makeLayout(d.rows, d.cols);
      const fromSid = newLayout[fromRow]?.[fromCol] ?? null;
      const toSid = newLayout[toRow]?.[toCol] ?? null;

      // 固定席チェック（移動先の生徒が固定なら何もしない）
      if (toSid) {
        const cons = d.considerations.find(c => c.studentId === toSid);
        if (cons?.fixed) return d;
      }
      newLayout[fromRow][fromCol] = toSid;
      newLayout[toRow][toCol] = fromSid;
      return { ...d, currentLayout: newLayout };
    });
  };

  /* --- Considerations --------------------------------------------------- */
  const setConsideration = (studentId, patch) => {
    update(d => {
      const existing = d.considerations.find(c => c.studentId === studentId);
      const base = existing || ensureConsideration([], studentId);
      const next = { ...base, ...patch };
      const considerations = existing
        ? d.considerations.map(c => c.studentId === studentId ? next : c)
        : [...d.considerations, next];
      return { ...d, considerations };
    });
  };

  /* --- Auto arrange ----------------------------------------------------- */
  const doAutoArrange = () => {
    update(d => {
      const ds = disabledSetFromSeats(d.seats);
      const newLayout = autoArrange(d.students, d.rows, d.cols, ds, d.considerations, d.currentLayout);
      return { ...d, currentLayout: newLayout };
    });
  };

  /* --- JSON Export / Import -------------------------------------------- */
  const exportJSON = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const className = (data.className || 'class').replace(/[^\w\u3000-\u9fff_-]/g, '_');
    a.href = url;
    a.download = `seat_${className}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || typeof parsed !== 'object') throw new Error('invalid JSON');
        if (!window.confirm('現在のデータを上書きします。続行しますか？')) return;
        const merged = { ...defaultData(), ...parsed };
        merged.currentLayout = merged.currentLayout
          ? normalizeLayout(merged.currentLayout, merged.rows, merged.cols, merged.students)
          : null;
        update(() => merged);
      } catch (err) {
        window.alert('JSONの読み込みに失敗しました: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const factoryReset = () => {
    if (!window.confirm('すべてのデータを初期化します。本当によろしいですか？')) return;
    safeStorage.remove();
    setData(defaultData());
    setHistory([]);
    setSelectedStudentId(null);
  };

  /* --- Print ----------------------------------------------------------- */
  const doPrint = () => {
    // 印刷時は教卓用 or 生徒用のどちらか直前の表示モードを使う
    if (viewMode === 'edit') setViewMode('student');
    setTimeout(() => window.print(), 100);
  };

  /* --- 検索系ヘルパー --------------------------------------------------- */
  const studentMap = useMemo(() =>
    new Map(data.students.map(s => [s.id, s])), [data.students]);

  const selectedCons = selectedStudentId
    ? ensureConsideration(data.considerations, selectedStudentId)
    : null;

  /* ===================================================================== */
  return (
    <div
      className="min-h-screen w-full bg-slate-100 text-slate-900 select-none"
      style={{ fontFamily: '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif' }}
    >
      <PrintStyles />

      {viewMode === 'edit' && (
        <EditModeUI
          data={data}
          warnings={warnings}
          disabledSet={disabledSet}
          layout={layout}
          studentMap={studentMap}
          selectedStudentId={selectedStudentId}
          selectedCons={selectedCons}
          deleteSeatMode={deleteSeatMode}
          setDeleteSeatMode={setDeleteSeatMode}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          dragState={dragState}
          savedFlash={savedFlash}
          history={history}
          // setters / handlers
          setClassName={(name) => updateNoHistory(d => ({ ...d, className: name }))}
          setRows={setRows}
          setCols={setCols}
          toggleDisabled={toggleDisabled}
          resetDisabledSeats={resetDisabledSeats}
          clearLayout={clearLayout}
          addStudent={addStudent}
          updateStudent={updateStudent}
          deleteStudent={deleteStudent}
          bulkAddFromCSV={bulkAddFromCSV}
          setSelectedStudentId={setSelectedStudentId}
          setConsideration={setConsideration}
          doAutoArrange={doAutoArrange}
          undo={undo}
          setViewMode={setViewMode}
          exportJSON={exportJSON}
          importJSON={importJSON}
          factoryReset={factoryReset}
          doPrint={doPrint}
          fileInputRef={fileInputRef}
          handleSeatPointerDown={handleSeatPointerDown}
        />
      )}

      {viewMode === 'student' && (
        <ViewerUI
          data={data}
          layout={layout}
          disabledSet={disabledSet}
          studentMap={studentMap}
          mode="student"
          onBack={() => setViewMode('edit')}
          onPrint={doPrint}
        />
      )}
      {viewMode === 'teacher' && (
        <ViewerUI
          data={data}
          layout={layout}
          disabledSet={disabledSet}
          studentMap={studentMap}
          mode="teacher"
          onBack={() => setViewMode('edit')}
          onPrint={doPrint}
        />
      )}
      {viewMode === 'print' && (
        <ViewerUI
          data={data}
          layout={layout}
          disabledSet={disabledSet}
          studentMap={studentMap}
          mode="student"
          isPrintPreview
          onBack={() => setViewMode('edit')}
          onPrint={doPrint}
        />
      )}

      {/* ドラッグゴースト */}
      {dragState && (
        <div
          className="fixed pointer-events-none z-50 rounded-lg shadow-xl bg-white border-2 border-blue-500 px-3 py-2 text-sm"
          style={{
            left: dragState.ghostX,
            top: dragState.ghostY,
            transform: 'translate(-50%, -50%)',
            minWidth: '120px'
          }}
        >
          {(() => {
            const s = studentMap.get(dragState.studentId);
            if (!s) return null;
            return (
              <div className="text-center">
                {s.number && <div className="text-xs text-slate-500">{s.number}</div>}
                <div className="font-bold">{s.name}</div>
                {s.kana && <div className="text-xs text-slate-500">{s.kana}</div>}
              </div>
            );
          })()}
        </div>
      )}

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJSON(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/* === Edit Mode UI ========================================================= */
function EditModeUI(props) {
  const {
    data, warnings, disabledSet, layout, studentMap,
    selectedStudentId, selectedCons, deleteSeatMode, setDeleteSeatMode,
    activeTab, setActiveTab, sidebarOpen, setSidebarOpen, dragState, savedFlash, history,
    setClassName, setRows, setCols, toggleDisabled, resetDisabledSeats, clearLayout,
    addStudent, updateStudent, deleteStudent, bulkAddFromCSV,
    setSelectedStudentId, setConsideration, doAutoArrange, undo, setViewMode,
    exportJSON, importJSON, factoryReset, doPrint, fileInputRef, handleSeatPointerDown,
  } = props;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ===== Header ===== */}
      <header className="no-print bg-slate-800 text-white shadow-md">
        <div className="px-3 py-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Armchair className="w-6 h-6 text-amber-300" />
            <span className="font-bold text-lg whitespace-nowrap">席替えサポート</span>
          </div>

          <input
            type="text"
            value={data.className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="クラス名（例: 3年A組）"
            className="px-3 py-2 rounded bg-slate-700 text-white placeholder-slate-400 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />

          <div className="flex-1 min-w-0" />

          <HeaderButton onClick={doAutoArrange} icon={Wand2} primary>
            自動配置
          </HeaderButton>
          <HeaderButton
            onClick={undo}
            icon={Undo2}
            disabled={history.length === 0}
            title="元に戻す"
          >
            元に戻す
          </HeaderButton>

          <div className="hidden sm:block w-px h-6 bg-slate-600 mx-1" />

          <HeaderButton onClick={() => setViewMode('student')} icon={Users} title="生徒用表示">
            生徒用
          </HeaderButton>
          <HeaderButton onClick={() => setViewMode('teacher')} icon={GraduationCap} title="教卓用表示">
            教卓用
          </HeaderButton>
          <HeaderButton onClick={doPrint} icon={Printer} title="印刷">
            印刷
          </HeaderButton>

          <div className="hidden sm:block w-px h-6 bg-slate-600 mx-1" />

          <HeaderButton onClick={exportJSON} icon={Download} title="JSON書き出し">
            書き出し
          </HeaderButton>
          <HeaderButton
            onClick={() => fileInputRef.current?.click()}
            icon={Upload}
            title="JSON読み込み"
          >
            読み込み
          </HeaderButton>

          {/* mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="lg:hidden ml-1 px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm flex items-center gap-1"
            title="設定パネル"
          >
            <Settings className="w-4 h-4" />
            設定
          </button>
        </div>

        {/* 保存ステータス */}
        <div className="px-3 pb-1 text-xs text-slate-300 flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 ${savedFlash ? 'text-emerald-300' : 'text-slate-400'}`}>
            <Check className="w-3 h-3" />
            自動保存{savedFlash ? '完了' : '中'}
          </span>
          {data.className && <span>クラス: {data.className}</span>}
          <span>名簿: {data.students.length}人 / 席: {data.rows * data.cols - disabledSet.size}席</span>
          {warnings.length > 0 && (
            <span className="text-amber-300 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />警告 {warnings.length}件
            </span>
          )}
        </div>
      </header>

      {/* ===== Main split ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
            no-print bg-white border-r border-slate-200 overflow-y-auto
            ${sidebarOpen ? 'block fixed inset-0 z-40 lg:relative lg:z-auto' : 'hidden'}
            lg:block lg:w-80 lg:flex-shrink-0
            w-full lg:w-80
          `}
        >
          {/* mobile close button */}
          <div className="lg:hidden flex justify-between items-center p-3 border-b">
            <span className="font-bold">設定パネル</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
            <SidebarTab active={activeTab === 'layout'} onClick={() => setActiveTab('layout')} icon={Layers}>
              座席
            </SidebarTab>
            <SidebarTab active={activeTab === 'roster'} onClick={() => setActiveTab('roster')} icon={Users}>
              名簿
            </SidebarTab>
            <SidebarTab active={activeTab === 'considerations'} onClick={() => setActiveTab('considerations')} icon={ListChecks}>
              配慮
            </SidebarTab>
            <SidebarTab active={activeTab === 'storage'} onClick={() => setActiveTab('storage')} icon={FileJson}>
              保存
            </SidebarTab>
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'layout' && (
              <LayoutTab
                data={data}
                setRows={setRows}
                setCols={setCols}
                deleteSeatMode={deleteSeatMode}
                setDeleteSeatMode={setDeleteSeatMode}
                resetDisabledSeats={resetDisabledSeats}
                clearLayout={clearLayout}
                disabledSet={disabledSet}
              />
            )}
            {activeTab === 'roster' && (
              <RosterTab
                students={data.students}
                addStudent={addStudent}
                updateStudent={updateStudent}
                deleteStudent={deleteStudent}
                bulkAddFromCSV={bulkAddFromCSV}
                onSelect={(id) => { setSelectedStudentId(id); setActiveTab('considerations'); }}
              />
            )}
            {activeTab === 'considerations' && (
              <ConsiderationsTab
                students={data.students}
                considerations={data.considerations}
                selectedStudentId={selectedStudentId}
                setSelectedStudentId={setSelectedStudentId}
                selectedCons={selectedCons}
                setConsideration={setConsideration}
              />
            )}
            {activeTab === 'storage' && (
              <StorageTab
                exportJSON={exportJSON}
                onImportClick={() => fileInputRef.current?.click()}
                factoryReset={factoryReset}
                savedFlash={savedFlash}
              />
            )}
          </div>
        </aside>

        {/* Main grid area */}
        <main className="flex-1 overflow-auto bg-slate-100 p-4">
          <SeatGrid
            data={data}
            layout={layout}
            disabledSet={disabledSet}
            studentMap={studentMap}
            selectedStudentId={selectedStudentId}
            deleteSeatMode={deleteSeatMode}
            dragState={dragState}
            onPointerDown={handleSeatPointerDown}
            onSeatTap={toggleDisabled}
            warnings={warnings}
          />
        </main>
      </div>

      {/* ===== Footer warnings ===== */}
      <footer className="no-print bg-amber-50 border-t border-amber-200 max-h-44 overflow-y-auto">
        <WarningsList warnings={warnings} />
      </footer>
    </div>
  );
}

/* === Header button ======================================================== */
function HeaderButton({ icon: Icon, children, onClick, disabled, primary, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        inline-flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium
        transition active:scale-95
        ${primary
          ? 'bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:bg-slate-600 disabled:text-slate-400'
          : 'bg-slate-700 text-white hover:bg-slate-600 disabled:bg-slate-700 disabled:text-slate-500'}
        disabled:cursor-not-allowed
       
      `}
    >
      {Icon && <Icon className="w-4 h-4" />}
      <span className="hidden md:inline">{children}</span>
    </button>
  );
}

/* === Sidebar Tab button =================================================== */
function SidebarTab({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 px-2 py-3 text-sm font-medium flex flex-col items-center gap-1
        transition border-b-2
        ${active
          ? 'border-blue-600 text-blue-700 bg-white'
          : 'border-transparent text-slate-600 hover:bg-slate-100'}
      `}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

/* === Layout Tab =========================================================== */
function LayoutTab({ data, setRows, setCols, deleteSeatMode, setDeleteSeatMode, resetDisabledSeats, clearLayout, disabledSet }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>座席のサイズ</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="行数" value={data.rows} onChange={setRows} min={1} max={20} />
          <NumberInput label="列数" value={data.cols} onChange={setCols} min={1} max={20} />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          現在の使用可能席: <span className="font-bold">{data.rows * data.cols - disabledSet.size}席</span>
        </p>
      </div>

      <div>
        <SectionTitle>使用不可席</SectionTitle>
        <button
          onClick={() => setDeleteSeatMode(m => !m)}
          className={`
            w-full px-3 py-3 rounded font-medium text-sm transition
           
            ${deleteSeatMode
              ? 'bg-rose-600 text-white hover:bg-rose-500'
              : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}
          `}
        >
          {deleteSeatMode ? '✓ 削除モード ON（席をタップで切替）' : '座席削除モード OFF'}
        </button>
        <button
          onClick={resetDisabledSeats}
          className="mt-2 w-full px-3 py-2 rounded bg-slate-100 text-slate-700 text-sm hover:bg-slate-200"
        >
          使用不可席をリセット
        </button>
      </div>

      <div>
        <SectionTitle>座席表</SectionTitle>
        <button
          onClick={clearLayout}
          className="w-full px-3 py-2 rounded bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 inline-flex items-center justify-center gap-1"
        >
          <RotateCcw className="w-4 h-4" />座席配置を初期化
        </button>
      </div>
    </div>
  );
}

/* === Roster Tab =========================================================== */
function RosterTab({ students, addStudent, updateStudent, deleteStudent, bulkAddFromCSV, onSelect }) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [kana, setKana] = useState('');
  const [gender, setGender] = useState('');
  const [csvText, setCsvText] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const handleAdd = () => {
    if (!name.trim()) return;
    addStudent({ number, name, kana, gender });
    setNumber(''); setName(''); setKana(''); setGender('');
  };

  const handleCsv = () => {
    const n = bulkAddFromCSV(csvText);
    if (n > 0) {
      window.alert(`${n}件の生徒を追加しました`);
      setCsvText('');
      setShowCsv(false);
    } else {
      window.alert('追加できる行が見つかりませんでした');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>生徒の追加</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={number}
            onChange={e => setNumber(e.target.value)}
            placeholder="出席番号"
            className="px-2 py-2 rounded border border-slate-300 text-sm"
          />
          <select
            value={gender}
            onChange={e => setGender(e.target.value)}
            className="px-2 py-2 rounded border border-slate-300 text-sm bg-white"
          >
            <option value="">性別</option>
            <option value="男">男</option>
            <option value="女">女</option>
            <option value="その他">その他</option>
          </select>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="氏名 *"
            className="col-span-2 px-2 py-2 rounded border border-slate-300 text-sm"
          />
          <input
            value={kana}
            onChange={e => setKana(e.target.value)}
            placeholder="ふりがな"
            className="col-span-2 px-2 py-2 rounded border border-slate-300 text-sm"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="w-full mt-2 px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:bg-slate-300 inline-flex items-center justify-center gap-1"
        >
          <UserPlus className="w-4 h-4" />追加
        </button>

        <button
          onClick={() => setShowCsv(s => !s)}
          className="w-full mt-2 px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 rounded inline-flex items-center justify-center gap-1"
        >
          {showCsv ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          CSV風テキストで一括登録
        </button>
        {showCsv && (
          <div className="mt-2">
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={`1,青木太郎,あおきたろう,男\n2,伊藤花子,いとうはなこ,女`}
              rows={5}
              className="w-full px-2 py-2 rounded border border-slate-300 text-xs font-mono"
            />
            <button
              onClick={handleCsv}
              className="mt-1 w-full px-3 py-2 rounded bg-slate-700 text-white text-sm hover:bg-slate-600"
            >
              一括登録
            </button>
          </div>
        )}
      </div>

      <div>
        <SectionTitle>名簿 ({students.length}人)</SectionTitle>
        <div className="space-y-1">
          {students.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-4">
              まだ生徒が登録されていません
            </div>
          )}
          {students.map(s => (
            <StudentRow
              key={s.id}
              student={s}
              editing={editingId === s.id}
              onStartEdit={() => setEditingId(s.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(patch) => { updateStudent(s.id, patch); setEditingId(null); }}
              onDelete={() => {
                if (window.confirm(`${s.name}さんを削除しますか？`)) deleteStudent(s.id);
              }}
              onSelect={() => onSelect(s.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentRow({ student, editing, onStartEdit, onCancelEdit, onSave, onDelete, onSelect }) {
  const [n, setN] = useState(student.number);
  const [name, setName] = useState(student.name);
  const [k, setK] = useState(student.kana);
  const [g, setG] = useState(student.gender);

  useEffect(() => {
    setN(student.number); setName(student.name); setK(student.kana); setG(student.gender);
  }, [student, editing]);

  if (editing) {
    return (
      <div className="rounded border border-blue-400 bg-blue-50 p-2 space-y-1">
        <div className="grid grid-cols-2 gap-1">
          <input value={n} onChange={e => setN(e.target.value)} className="px-2 py-1 rounded border text-xs" placeholder="番号" />
          <select value={g} onChange={e => setG(e.target.value)} className="px-2 py-1 rounded border text-xs bg-white">
            <option value="">性別</option>
            <option value="男">男</option>
            <option value="女">女</option>
            <option value="その他">その他</option>
          </select>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full px-2 py-1 rounded border text-xs" placeholder="氏名" />
        <input value={k} onChange={e => setK(e.target.value)} className="w-full px-2 py-1 rounded border text-xs" placeholder="ふりがな" />
        <div className="flex gap-1">
          <button onClick={() => onSave({ number: n, name, kana: k, gender: g })} className="flex-1 px-2 py-1 rounded bg-blue-600 text-white text-xs">保存</button>
          <button onClick={onCancelEdit} className="flex-1 px-2 py-1 rounded bg-slate-200 text-xs">キャンセル</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 group">
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 text-left min-w-0"
      >
        <span className="text-xs text-slate-500 font-mono w-7 flex-shrink-0">{student.number || '-'}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{student.name}</span>
          <span className="block text-xs text-slate-500 truncate">{student.kana}</span>
        </span>
        {student.gender && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{student.gender}</span>
        )}
      </button>
      <button onClick={onStartEdit} className="p-1.5 rounded hover:bg-slate-200 opacity-50 group-hover:opacity-100">
        <Edit2 className="w-3.5 h-3.5" />
      </button>
      <button onClick={onDelete} className="p-1.5 rounded hover:bg-rose-100 text-rose-600 opacity-50 group-hover:opacity-100">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* === Considerations Tab =================================================== */
function ConsiderationsTab({ students, considerations, selectedStudentId, setSelectedStudentId, selectedCons, setConsideration }) {
  const selected = students.find(s => s.id === selectedStudentId);

  if (students.length === 0) {
    return (
      <div className="text-sm text-slate-500 text-center py-6">
        先に「名簿」タブから生徒を登録してください
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>対象の生徒</SectionTitle>
        <select
          value={selectedStudentId || ''}
          onChange={e => setSelectedStudentId(e.target.value || null)}
          className="w-full px-3 py-2 rounded border border-slate-300 text-sm bg-white"
        >
          <option value="">-- 生徒を選択 --</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>
              {s.number ? `${s.number}. ` : ''}{s.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">座席表の生徒をタップしても選択できます</p>
      </div>

      {!selected && (
        <div className="text-sm text-slate-500 text-center py-4">
          生徒を選択すると配慮事項を設定できます
        </div>
      )}

      {selected && selectedCons && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">{selected.number ? `${selected.number}. ` : ''}{selected.gender}</div>
            <div className="font-bold">{selected.name}</div>
            <div className="text-xs text-slate-500">{selected.kana}</div>
          </div>

          <div>
            <SectionTitle>位置の希望</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="前方希望" checked={!!selectedCons.preferFront} onChange={(v) => setConsideration(selected.id, { preferFront: v, preferBack: v ? false : selectedCons.preferBack })} />
              <Toggle label="後方希望" checked={!!selectedCons.preferBack} onChange={(v) => setConsideration(selected.id, { preferBack: v, preferFront: v ? false : selectedCons.preferFront })} />
              <Toggle label="左側希望" checked={!!selectedCons.preferLeft} onChange={(v) => setConsideration(selected.id, { preferLeft: v, preferRight: v ? false : selectedCons.preferRight })} />
              <Toggle label="右側希望" checked={!!selectedCons.preferRight} onChange={(v) => setConsideration(selected.id, { preferRight: v, preferLeft: v ? false : selectedCons.preferLeft })} />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <Toggle label="教卓近く希望" checked={!!selectedCons.preferNearTeacherDesk} onChange={(v) => setConsideration(selected.id, { preferNearTeacherDesk: v })} />
              <Toggle label={<span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" />固定席（現在位置を維持）</span>} checked={!!selectedCons.fixed} onChange={(v) => setConsideration(selected.id, { fixed: v })} />
            </div>
          </div>

          <div>
            <SectionTitle>隣にしない生徒</SectionTitle>
            <CheckList
              items={students.filter(s => s.id !== selected.id)}
              selected={selectedCons.avoidAdjacentStudentIds || []}
              onChange={(ids) => setConsideration(selected.id, { avoidAdjacentStudentIds: ids })}
            />
          </div>

          <div>
            <SectionTitle>近くにしない生徒（8マス以内）</SectionTitle>
            <CheckList
              items={students.filter(s => s.id !== selected.id)}
              selected={selectedCons.avoidNearbyStudentIds || []}
              onChange={(ids) => setConsideration(selected.id, { avoidNearbyStudentIds: ids })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CheckList({ items, selected, onChange }) {
  if (items.length === 0) {
    return <div className="text-xs text-slate-400">他に生徒がいません</div>;
  }
  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="max-h-44 overflow-y-auto rounded border border-slate-200 bg-white">
      {items.map(s => (
        <label key={s.id} className="flex items-center gap-2 px-2 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0">
          <input
            type="checkbox"
            checked={selected.includes(s.id)}
            onChange={() => toggle(s.id)}
            className="w-4 h-4"
          />
          <span className="text-xs text-slate-500 w-7 font-mono">{s.number || '-'}</span>
          <span className="text-sm flex-1 truncate">{s.name}</span>
        </label>
      ))}
    </div>
  );
}

/* === Storage Tab ========================================================== */
function StorageTab({ exportJSON, onImportClick, factoryReset, savedFlash }) {
  const storageAvailable = useMemo(() => safeStorage.available(), []);

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>自動保存</SectionTitle>
        <div className={`rounded-lg p-3 text-sm ${storageAvailable ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
          {storageAvailable ? (
            <span className="inline-flex items-center gap-1"><Check className="w-4 h-4" />端末のlocalStorageに自動保存中</span>
          ) : (
            <span className="inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" />このブラウザでは自動保存が無効です（プライベートモードなど）</span>
          )}
        </div>
      </div>

      <div>
        <SectionTitle>引き継ぎ</SectionTitle>
        <p className="text-xs text-slate-500 mb-2">
          別端末で続きを編集するには、JSONファイルを書き出して読み込んでください。
        </p>
        <button
          onClick={exportJSON}
          className="w-full px-3 py-3 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 inline-flex items-center justify-center gap-1"
        >
          <Download className="w-4 h-4" />JSON書き出し
        </button>
        <button
          onClick={onImportClick}
          className="mt-2 w-full px-3 py-3 rounded bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 inline-flex items-center justify-center gap-1"
        >
          <Upload className="w-4 h-4" />JSON読み込み
        </button>
      </div>

      <div>
        <SectionTitle>初期化</SectionTitle>
        <button
          onClick={factoryReset}
          className="w-full px-3 py-3 rounded bg-rose-600 text-white text-sm font-medium hover:bg-rose-500 inline-flex items-center justify-center gap-1"
        >
          <Trash2 className="w-4 h-4" />全データ初期化
        </button>
      </div>
    </div>
  );
}

/* === Seat Grid (Edit mode) ================================================ */
function SeatGrid({ data, layout, disabledSet, studentMap, selectedStudentId, deleteSeatMode, dragState, onPointerDown, warnings }) {
  const warningStudentIds = useMemo(() => {
    const ids = new Set();
    for (const w of warnings) {
      if (w.key?.startsWith('adj-') || w.key?.startsWith('near-')) {
        // adj-id1-id2: extract ids
        const parts = w.key.split('-');
        for (let i = 1; i < parts.length; i++) ids.add(parts[i]);
      } else if (w.key?.startsWith('pref-')) {
        const sid = w.key.split('-').slice(2).join('-');
        ids.add(sid);
      } else if (w.key?.startsWith('disabled-')) {
        ids.add(w.key.slice('disabled-'.length));
      }
    }
    return ids;
  }, [warnings]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Blackboard */}
      <div className="rounded-t-lg bg-gradient-to-b from-emerald-800 to-emerald-900 text-white text-center py-3 font-bold tracking-widest shadow-inner">
        ─── 黒板（前方）───
      </div>

      <div className="bg-white border-x border-b border-slate-300 rounded-b-lg p-4 sm:p-6 shadow-sm">
        <div
          className="grid gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: `repeat(${data.cols}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: data.rows }).map((_, r) => (
            Array.from({ length: data.cols }).map((__, c) => {
              const disabled = disabledSet.has(`${r},${c}`);
              const studentId = layout[r]?.[c] || null;
              const student = studentId ? studentMap.get(studentId) : null;
              const cons = studentId ? data.considerations.find(x => x.studentId === studentId) : null;
              const isSelected = studentId && studentId === selectedStudentId;
              const isDragging = dragState?.studentId === studentId;
              const hasWarning = studentId && warningStudentIds.has(studentId);

              return (
                <SeatCell
                  key={`${r}-${c}`}
                  row={r}
                  col={c}
                  disabled={disabled}
                  student={student}
                  isFixed={!!cons?.fixed}
                  isSelected={isSelected}
                  isDragging={isDragging}
                  hasWarning={hasWarning}
                  deleteSeatMode={deleteSeatMode}
                  onPointerDown={onPointerDown}
                />
              );
            })
          ))}
        </div>
      </div>

      <div className="text-center text-xs text-slate-400 mt-2">
        {deleteSeatMode
          ? '席をタップで使用不可⇄使用可能を切替'
          : '生徒をドラッグで移動・入替（iPadでは少し長押し）'}
      </div>
    </div>
  );
}

function SeatCell({ row, col, disabled, student, isFixed, isSelected, isDragging, hasWarning, deleteSeatMode, onPointerDown }) {
  const base = 'rounded-md border-2 flex flex-col items-center justify-center text-center px-1 py-1 transition relative overflow-hidden';

  let cls;
  if (disabled) {
    cls = `${base} bg-slate-300 border-slate-400 text-slate-500`;
  } else if (!student) {
    cls = `${base} bg-slate-50 border-dashed border-slate-300 text-slate-400`;
  } else {
    cls = `${base} bg-white border-slate-300 text-slate-900 shadow-sm cursor-grab active:cursor-grabbing`;
    if (isSelected) cls += ' ring-2 ring-blue-500 border-blue-400';
    if (hasWarning) cls += ' ring-2 ring-amber-500 border-amber-400 bg-amber-50';
    if (isDragging) cls += ' opacity-30';
  }

  if (deleteSeatMode) {
    cls += ' cursor-pointer hover:ring-2 hover:ring-rose-400';
  }

  return (
    <div
      data-seat
      data-row={row}
      data-col={col}
      className={cls}
      onPointerDown={(e) => onPointerDown(e, row, col)}
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {disabled && <span className="text-xs">使用不可</span>}
      {!disabled && !student && (
        <span className="text-xs">空席</span>
      )}
      {!disabled && student && (
        <>
          {isFixed && (
            <div className="absolute top-0.5 right-0.5">
              <Lock className="w-3 h-3 text-amber-600" />
            </div>
          )}
          {student.number && (
            <div className="text-xs text-slate-500 font-mono leading-none">{student.number}</div>
          )}
          <div className="text-sm sm:text-base font-bold leading-tight mt-0.5 truncate w-full">{student.name}</div>
          {student.kana && (
            <div className="text-xs text-slate-500 leading-none mt-0.5 truncate w-full">{student.kana}</div>
          )}
        </>
      )}
    </div>
  );
}

/* === Warnings list ======================================================== */
function WarningsList({ warnings }) {
  if (warnings.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-emerald-700 inline-flex items-center gap-1">
        <Check className="w-4 h-4" />配慮事項違反は見つかりませんでした
      </div>
    );
  }
  return (
    <div className="px-3 py-2">
      <div className="text-xs font-bold text-amber-900 mb-1 inline-flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />警告・未解決の配慮事項 ({warnings.length})
      </div>
      <ul className="space-y-0.5">
        {warnings.map(w => (
          <li key={w.key}
              className={`text-xs px-2 py-1 rounded ${w.severity === 'error' ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-900'}`}>
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* === Viewer (student / teacher / print) =================================== */
function ViewerUI({ data, layout, disabledSet, studentMap, mode, isPrintPreview, onBack, onPrint }) {
  const isTeacher = mode === 'teacher';
  // 教卓用は上下反転
  const displayRows = isTeacher
    ? [...Array(data.rows).keys()].reverse()
    : [...Array(data.rows).keys()];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="no-print bg-slate-800 text-white px-4 py-2 flex items-center gap-2">
        <button onClick={onBack} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm">
          ← 編集に戻る
        </button>
        <div className="flex-1 text-center">
          <span className="font-bold">
            {mode === 'student' && '生徒用 座席表'}
            {mode === 'teacher' && '教卓用 座席表'}
          </span>
          {data.className && <span className="ml-2 text-slate-300">{data.className}</span>}
        </div>
        <button onClick={onPrint} className="px-3 py-2 rounded bg-amber-400 text-slate-900 hover:bg-amber-300 text-sm font-medium inline-flex items-center gap-1">
          <Printer className="w-4 h-4" />印刷
        </button>
      </header>

      <main className="flex-1 p-4 sm:p-6 print-area">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-3 print:mb-2">
            <div className="text-lg sm:text-xl font-bold">{data.className || 'クラス'} 座席表</div>
            <div className="text-xs text-slate-500">
              {mode === 'student' ? '（生徒向け）' : '（教卓側から）'}
            </div>
          </div>

          {!isTeacher && (
            <div className="border-2 border-slate-900 bg-slate-100 text-center py-2 font-bold tracking-widest mb-3">
              黒　板
            </div>
          )}

          <div
           className="grid gap-1 print:gap-1 seat-print-grid"
           style={{
            gridTemplateColumns: `repeat(${data.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${data.rows}, minmax(0, 1fr))`,
          }}
          >
            {displayRows.map((r) => {
              const displayCols = isTeacher
              ? [...Array(data.cols).keys()].reverse()
              : [...Array(data.cols).keys()];

              return displayCols.map((c) => {
                const disabled = disabledSet.has(`${r},${c}`);
                const studentId = layout[r]?.[c] || null;
                const student = studentId ? studentMap.get(studentId) : null;
                return (
                  <div
                    key={`${r}-${c}`}
                    className={`border border-slate-900 rounded-sm flex flex-col items-center justify-center text-center px-0.5 py-0.5
                    text-[10px] print:text-[8px] print:rounded-none
                      ${disabled ? 'bg-slate-200' : 'bg-white'}
                    `}
                    style={{ minHeight: 0 }}
                  >
                    {disabled && <span className="text-xs text-slate-500">使用不可</span>}
                    {!disabled && !student && <span className="text-xs text-slate-400">空席</span>}
                    {!disabled && student && (
                      <>
                        {student.number && (
                          <div className="text-xs text-slate-700 font-mono">{student.number}</div>
                        )}
                        <div className="text-sm sm:text-base print:text-[10px] font-bold leading-tight">{student.name}</div>
                        {student.kana && (
                          <div className="text-xs text-slate-700 leading-tight">{student.kana}</div>
                        )}
                      </>
                    )}
                  </div>
                );
              });
            })}
          </div>

          {isTeacher && (
            <div className="border-2 border-slate-900 bg-slate-100 text-center py-2 font-bold tracking-widest mt-3">
              黒　板
            </div>
          )}

          <div className="text-right text-xs text-slate-500 mt-2 print:mt-1">
            {new Date().toLocaleDateString('ja-JP')}
          </div>
        </div>
      </main>
    </div>
  );
}

/* === Small atoms ========================================================== */
function SectionTitle({ children }) {
  return (
    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-1">
      {children}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <div className="mt-1 flex items-center rounded border border-slate-300 overflow-hidden">
        <button onClick={dec} className="px-3 py-2 bg-slate-100 hover:bg-slate-200">−</button>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min}
          max={max}
          className="flex-1 px-2 py-2 text-center text-sm w-full"
        />
        <button onClick={inc} className="px-3 py-2 bg-slate-100 hover:bg-slate-200">＋</button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 px-2 py-2 rounded border border-slate-200 cursor-pointer hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
      />
      <span className="text-sm flex-1">{label}</span>
    </label>
  );
}

/* === Print Styles ========================================================= */
function PrintStyles() {
  return (
    <style>{`
     @media print {
  @page {
    size: A4 landscape;
    margin: 4mm;
  }

  html, body, #root {
    width: 289mm;
    height: 202mm;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    overflow: hidden !important;
  }

  body {
    zoom: 1;
  }

  .no-print {
    display: none !important;
  }

  .min-h-screen {
    min-height: 0 !important;
  }

  .print-area {
    padding: 0 !important;
    margin: 0 !important;
    height: 190mm !important;
    overflow: hidden !important;
  }

  .print-area > div {
    max-width: none !important;
    height: 190mm !important;
    display: flex !important;
    flex-direction: column !important;
  }

  .print-area .text-center {
    margin-bottom: 1mm !important;
  }

  .seat-print-grid {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    height: 145mm !important;
    max-height: 145mm !important;
    gap: 1mm !important;
  }

  .seat-print-grid > div {
    min-height: 0 !important;
    height: auto !important;
    overflow: hidden !important;
    padding: 0.5mm !important;
    font-size: 7px !important;
    line-height: 1 !important;
  }

  .seat-print-grid > div div {
    line-height: 1 !important;
  }
}
    `}</style>
  );
}
