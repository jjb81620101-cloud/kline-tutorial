// K線教學軟體

// 狀態管理
let currentPage = 'mainMenu';
let currentLessonIndex = 0;
let quizData = [];
let quizIndex = 0;
let correctAnswers = 0;
let totalAnswers = 0;
let selectedAnswer = null;

const STORAGE_KEY = 'klineProgress';

// ─── SVG K線圖繪製 ──────────────────────────────────────
function renderKlineChart(candles, container, height = 200) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const W = 400, H = height;
    const pad = { t: 15, b: 15, l: 20, r: 20 };
    const cw = W - pad.l - pad.r;
    const ch = H - pad.t - pad.b;

    const maxP  = Math.max(...candles.map(c => c.high));
    const minP  = Math.min(...candles.map(c => c.low));
    const range = maxP - minP || 10;
    const pTop  = maxP + range * 0.15;
    const pBot  = minP - range * 0.15;
    const pSpan = pTop - pBot;

    const py = p => pad.t + (pTop - p) / pSpan * ch;
    const spacing = cw / candles.length;
    const cndW = Math.max(4, Math.min(spacing * 0.65, 40));

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // 背景
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', W); bg.setAttribute('height', H);
    bg.setAttribute('fill', '#1a1a2e'); bg.setAttribute('rx', '8');
    svg.appendChild(bg);

    // 格線
    [1, 2, 3].forEach(i => {
        const gl = document.createElementNS(svgNS, 'line');
        const gy = pad.t + (ch / 4) * i;
        gl.setAttribute('x1', pad.l);    gl.setAttribute('y1', gy);
        gl.setAttribute('x2', W - pad.r); gl.setAttribute('y2', gy);
        gl.setAttribute('stroke', '#2a2a4e'); gl.setAttribute('stroke-width', '1');
        svg.appendChild(gl);
    });

    candles.forEach((c, i) => {
        const x   = pad.l + i * spacing + spacing / 2;
        const bull = c.close >= c.open;
        const col  = bull ? '#ef5350' : '#26a69a';   // 台灣：紅漲綠跌
        const sw   = candles.length === 1 ? '2.5' : '1.5';

        const hY = py(c.high), lY = py(c.low);
        const oY = py(c.open), cY = py(c.close);
        const bTop = Math.min(oY, cY);
        const bBot = Math.max(oY, cY);
        const bH   = Math.max(2, bBot - bTop);

        const mkLine = (x1, y1, x2, y2) => {
            const el = document.createElementNS(svgNS, 'line');
            el.setAttribute('x1', x1); el.setAttribute('y1', y1);
            el.setAttribute('x2', x2); el.setAttribute('y2', y2);
            el.setAttribute('stroke', col); el.setAttribute('stroke-width', sw);
            svg.appendChild(el);
        };
        mkLine(x, hY, x, bTop);   // 上影線
        mkLine(x, bBot, x, lY);   // 下影線

        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', x - cndW / 2); rect.setAttribute('y', bTop);
        rect.setAttribute('width', cndW);      rect.setAttribute('height', bH);
        rect.setAttribute('fill', col);        rect.setAttribute('stroke', col);
        rect.setAttribute('rx', '1');
        svg.appendChild(rect);
    });

    container.innerHTML = '';
    container.appendChild(svg);
}

// ─── 教學內容 ───────────────────────────────────────────
const lessons = [
    {
        title: '第 1 課：什麼是 K線？',
        content: `
            <div class="lesson">
                <h3>K線的基本概念</h3>
                <p>K線（蠟燭圖）是股票技術分析的基礎，用四個價格表示一段時間內的股價變化：</p>
                <p><strong>開盤價</strong>：該時段開始時的股價</p>
                <p><strong>最高價</strong>：該時段內的最高股價</p>
                <p><strong>最低價</strong>：該時段內的最低股價</p>
                <p><strong>收盤價</strong>：該時段結束時的股價</p>

                <h3>陽線 vs 陰線</h3>
                <p><strong style="color:#ef5350;">紅色／陽線</strong>：收盤 > 開盤（上漲）&nbsp;&nbsp;
                   <strong style="color:#26a69a;">綠色／陰線</strong>：收盤 &lt; 開盤（下跌）</p>
                <div id="l1-compare" class="kline-chart-example"></div>

                <h3>K線的組成</h3>
                <div class="lesson-example">
                <strong>實體</strong>：開盤價和收盤價之間的矩形部分<br>
                <strong>上影線</strong>：實體上方的細線（最高價 − 收盤價）<br>
                <strong>下影線</strong>：實體下方的細線（開盤價 − 最低價）
                </div>
            </div>
        `,
        charts: [
            {
                id: 'l1-compare',
                candles: [
                    { open: 88, high: 115, low: 82, close: 110 },
                    { open: 110, high: 116, low: 82, close: 88 },
                ],
                height: 200
            }
        ]
    },
    {
        title: '第 2 課：K線的基本形態',
        content: `
            <div class="lesson">
                <h3>常見的 K線形態</h3>

                <p><strong>1. 陽線（上漲）</strong> — 收盤 > 開盤，買方強勢</p>
                <div id="l2-bull" class="kline-chart-example"></div>

                <p><strong>2. 陰線（下跌）</strong> — 收盤 &lt; 開盤，賣方強勢</p>
                <div id="l2-bear" class="kline-chart-example"></div>

                <p><strong>3. 十字線</strong> — 開盤 ≈ 收盤，買賣均衡</p>
                <div id="l2-doji" class="kline-chart-example"></div>

                <p><strong>4. 錘子線</strong> — 下影線長，實體小，常見於底部（看漲信號）</p>
                <div id="l2-hammer" class="kline-chart-example"></div>

                <p><strong>5. 倒錘子線</strong> — 上影線長，實體小，常見於頂部（看跌信號）</p>
                <div id="l2-invhammer" class="kline-chart-example"></div>
            </div>
        `,
        charts: [
            { id: 'l2-bull',      candles: [{ open: 85, high: 116, low: 82, close: 112 }], height: 160 },
            { id: 'l2-bear',      candles: [{ open: 112, high: 116, low: 82, close: 85 }], height: 160 },
            { id: 'l2-doji',      candles: [{ open: 100, high: 116, low: 84, close: 100 }], height: 160 },
            { id: 'l2-hammer',    candles: [{ open: 100, high: 104, low: 65, close: 101 }], height: 160 },
            { id: 'l2-invhammer', candles: [{ open: 100, high: 135, low: 96, close: 99  }], height: 160 },
        ]
    },
    {
        title: '第 3 課：K線與趨勢',
        content: `
            <div class="lesson">
                <h3>上升趨勢</h3>
                <p>連續陽線，高點和低點逐漸上升。<strong>買點信號：</strong>在支撐位附近的陽線。</p>
                <div id="l3-up" class="kline-chart-example"></div>

                <h3>下降趨勢</h3>
                <p>連續陰線，高點和低點逐漸下降。<strong>賣點信號：</strong>在阻力位附近的陰線。</p>
                <div id="l3-down" class="kline-chart-example"></div>

                <h3>震盪趨勢</h3>
                <p>陰陽交替，在支撐和阻力之間反覆震盪。<strong>交易策略：</strong>在底部買，在頂部賣。</p>
                <div id="l3-side" class="kline-chart-example"></div>
            </div>
        `,
        charts: [
            {
                id: 'l3-up',
                candles: [
                    { open: 78,  high: 88,  low: 76,  close: 86  },
                    { open: 86,  high: 96,  low: 84,  close: 94  },
                    { open: 94,  high: 104, low: 92,  close: 102 },
                    { open: 102, high: 112, low: 100, close: 110 },
                    { open: 110, high: 121, low: 108, close: 119 },
                ],
                height: 200
            },
            {
                id: 'l3-down',
                candles: [
                    { open: 119, high: 121, low: 108, close: 110 },
                    { open: 110, high: 112, low: 100, close: 102 },
                    { open: 102, high: 104, low: 92,  close: 94  },
                    { open: 94,  high: 96,  low: 84,  close: 86  },
                    { open: 86,  high: 88,  low: 76,  close: 78  },
                ],
                height: 200
            },
            {
                id: 'l3-side',
                candles: [
                    { open: 95,  high: 108, low: 92, close: 105 },
                    { open: 105, high: 108, low: 93, close: 96  },
                    { open: 96,  high: 109, low: 93, close: 106 },
                    { open: 106, high: 109, low: 93, close: 95  },
                    { open: 95,  high: 109, low: 92, close: 107 },
                ],
                height: 200
            }
        ]
    }
];

// ─── 測驗題庫 ────────────────────────────────────────────
const quizBank = [
    {
        type: 'basic',
        title: '基礎判讀 #1',
        candles: [{ open: 108, high: 115, low: 82, close: 88 }],
        question: '這根 K線代表什麼？',
        options: [
            { text: '上漲（陽線）', correct: false },
            { text: '下跌（陰線）', correct: true },
            { text: '十字線', correct: false },
            { text: '無法判斷', correct: false }
        ]
    },
    {
        type: 'basic',
        title: '基礎判讀 #2',
        candles: [{ open: 88, high: 115, low: 82, close: 108 }],
        question: '這根 K線代表什麼？',
        options: [
            { text: '上漲（陽線）', correct: true },
            { text: '下跌（陰線）', correct: false },
            { text: '十字線', correct: false },
            { text: '下影線很長', correct: false }
        ]
    },
    {
        type: 'basic',
        title: '形態識別 #1',
        candles: [{ open: 100, high: 104, low: 65, close: 101 }],
        question: '這種形態叫什麼？',
        options: [
            { text: '陽線', correct: false },
            { text: '陰線', correct: false },
            { text: '錘子線（看漲信號）', correct: true },
            { text: '倒錘子線', correct: false }
        ]
    },
    {
        type: 'basic',
        title: '形態識別 #2',
        candles: [{ open: 100, high: 135, low: 96, close: 99 }],
        question: '這種形態叫什麼？',
        options: [
            { text: '錘子線', correct: false },
            { text: '倒錘子線（看跌信號）', correct: true },
            { text: '十字線', correct: false },
            { text: '陽線', correct: false }
        ]
    },
    {
        type: 'trend',
        title: '趨勢判斷 #1',
        candles: [
            { open: 78,  high: 88,  low: 76,  close: 86  },
            { open: 86,  high: 96,  low: 84,  close: 94  },
            { open: 94,  high: 104, low: 92,  close: 102 },
            { open: 102, high: 112, low: 100, close: 110 },
            { open: 110, high: 121, low: 108, close: 119 },
        ],
        question: '這是什麼趨勢？',
        options: [
            { text: '上升趨勢', correct: true },
            { text: '下降趨勢', correct: false },
            { text: '震盪趨勢', correct: false },
            { text: '反轉信號', correct: false }
        ]
    },
    {
        type: 'trend',
        title: '趨勢判斷 #2',
        candles: [
            { open: 119, high: 121, low: 108, close: 110 },
            { open: 110, high: 112, low: 100, close: 102 },
            { open: 102, high: 104, low: 92,  close: 94  },
            { open: 94,  high: 96,  low: 84,  close: 86  },
            { open: 86,  high: 88,  low: 76,  close: 78  },
        ],
        question: '這是什麼趨勢？',
        options: [
            { text: '上升趨勢', correct: false },
            { text: '下降趨勢', correct: true },
            { text: '震盪趨勢', correct: false },
            { text: '反轉信號', correct: false }
        ]
    },
    {
        type: 'trend',
        title: '趨勢判斷 #3',
        candles: [
            { open: 95,  high: 108, low: 92, close: 105 },
            { open: 105, high: 108, low: 93, close: 96  },
            { open: 96,  high: 109, low: 93, close: 106 },
            { open: 106, high: 109, low: 93, close: 95  },
            { open: 95,  high: 109, low: 92, close: 107 },
        ],
        question: '這是什麼趨勢？',
        options: [
            { text: '上升趨勢', correct: false },
            { text: '下降趨勢', correct: false },
            { text: '震盪趨勢', correct: true },
            { text: '強勢上漲', correct: false }
        ]
    },
    {
        type: 'signal',
        title: '買賣信號 #1',
        candles: [
            { open: 78,  high: 88,  low: 76,  close: 86  },
            { open: 86,  high: 96,  low: 84,  close: 94  },
            { open: 94,  high: 104, low: 92,  close: 102 },
            { open: 102, high: 112, low: 100, close: 110 },
            { open: 110, high: 121, low: 108, close: 119 },
        ],
        question: '在上升趨勢中，下一步應該怎麼做？',
        options: [
            { text: '買入，期望繼續上漲', correct: true },
            { text: '賣出，防止下跌', correct: false },
            { text: '觀望，等待反轉', correct: false },
            { text: '無法判斷', correct: false }
        ]
    },
    {
        type: 'signal',
        title: '買賣信號 #2',
        candles: [
            { open: 119, high: 121, low: 108, close: 110 },
            { open: 110, high: 112, low: 100, close: 102 },
            { open: 102, high: 104, low: 92,  close: 94  },
            { open: 94,  high: 96,  low: 84,  close: 86  },
            { open: 86,  high: 88,  low: 76,  close: 78  },
        ],
        question: '在下降趨勢中，下一步應該怎麼做？',
        options: [
            { text: '買入，底部反彈', correct: false },
            { text: '賣出或持幣，防止進一步下跌', correct: true },
            { text: '加碼買入', correct: false },
            { text: '等待買點', correct: false }
        ]
    },
    {
        type: 'signal',
        title: '信號強度 #1',
        candles: [
            { open: 95,  high: 108, low: 92, close: 105 },
            { open: 105, high: 108, low: 93, close: 96  },
            { open: 96,  high: 109, low: 93, close: 106 },
            { open: 106, high: 109, low: 93, close: 95  },
            { open: 95,  high: 97,  low: 88, close: 90  },
        ],
        question: '在震盪趨勢中看到最後一根陰線，這是什麼信號？',
        options: [
            { text: '強烈買入信號', correct: false },
            { text: '強烈賣出信號', correct: false },
            { text: '回到支撐位，可以考慮買入', correct: true },
            { text: '應該清倉', correct: false }
        ]
    }
];

// ─── 頁面導航 ────────────────────────────────────────────
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenName).classList.remove('hidden');
    currentPage = screenName;
}

function goBack() {
    showScreen('mainMenu');
}

// ─── 教學 ────────────────────────────────────────────────
function startLesson() {
    currentLessonIndex = 0;
    displayLesson();
    showScreen('lessonMode');
}

function displayLesson() {
    if (currentLessonIndex < lessons.length) {
        const lesson = lessons[currentLessonIndex];
        const content = document.getElementById('lessonContent');
        content.innerHTML = `<h2>${lesson.title}</h2>${lesson.content}`;
        if (lesson.charts) {
            lesson.charts.forEach(({ id, candles, height }) => {
                const el = document.getElementById(id);
                if (el) renderKlineChart(candles, el, height || 180);
            });
        }
    }
}

function nextLesson() {
    currentLessonIndex++;
    if (currentLessonIndex >= lessons.length) {
        startQuiz();
    } else {
        displayLesson();
    }
}

// ─── 測驗 ────────────────────────────────────────────────
function startQuiz() {
    const shuffled = [...quizBank].sort(() => Math.random() - 0.5).slice(0, 10);
    quizData = shuffled;
    quizIndex = 0;
    correctAnswers = 0;
    totalAnswers = 0;
    selectedAnswer = null;

    showScreen('quizMode');
    displayQuiz();
}

function displayQuiz() {
    if (quizIndex >= quizData.length) {
        showCompletionScreen();
        return;
    }

    const quiz = quizData[quizIndex];
    const progress = Math.round((quizIndex / quizData.length) * 100);
    const successRate = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

    document.getElementById('quizProgress').textContent = progress;
    document.getElementById('successRate').textContent = successRate;
    document.getElementById('quizTitle').textContent = quiz.title;
    document.getElementById('quizQuestion').textContent = quiz.question;

    // 渲染 SVG K線圖
    const klineDisplay = document.getElementById('klineDisplay');
    renderKlineChart(quiz.candles, klineDisplay, quiz.candles.length === 1 ? 260 : 200);

    // 顯示選項
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = quiz.options.map((opt, idx) => `
        <label class="option">
            <input type="radio" name="answer" value="${idx}" onchange="selectAnswer(${idx})">
            ${opt.text}
        </label>
    `).join('');

    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('submitBtn').classList.remove('hidden');
    document.getElementById('nextBtn').classList.add('hidden');
    selectedAnswer = null;
}

function selectAnswer(idx) {
    selectedAnswer = idx;
    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    document.querySelectorAll('.option')[idx].classList.add('selected');
}

function submitAnswer() {
    if (selectedAnswer === null) {
        alert('請選擇答案');
        return;
    }

    const quiz = quizData[quizIndex];
    const isCorrect = quiz.options[selectedAnswer].correct;

    totalAnswers++;
    if (isCorrect) correctAnswers++;

    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden', 'correct', 'incorrect');

    if (isCorrect) {
        feedback.classList.add('correct');
        feedback.innerHTML = '✅ 正確！';
    } else {
        feedback.classList.add('incorrect');
        const correctOption = quiz.options.findIndex(o => o.correct);
        feedback.innerHTML = `❌ 錯誤！<br>正確答案是：<strong>${quiz.options[correctOption].text}</strong>`;
    }

    document.querySelectorAll('.option').forEach((opt, idx) => {
        opt.classList.remove('selected');
        if (idx === selectedAnswer) {
            opt.classList.add(isCorrect ? 'correct' : 'incorrect');
        } else if (idx === quiz.options.findIndex(o => o.correct)) {
            opt.classList.add('correct');
        }
    });

    document.getElementById('submitBtn').classList.add('hidden');
    document.getElementById('nextBtn').classList.remove('hidden');
}

function nextQuiz() {
    quizIndex++;
    selectedAnswer = null;
    if (quizIndex >= quizData.length) {
        showCompletionScreen();
    } else {
        displayQuiz();
    }
}

function showCompletionScreen() {
    const successRate = Math.round((correctAnswers / totalAnswers) * 100);
    document.getElementById('finalScore').textContent = successRate;

    const quizContainer = document.getElementById('quizContainer');
    const completeMessage = document.getElementById('completeMessage');

    if (successRate >= 80) {
        quizContainer.classList.add('hidden');
        completeMessage.classList.remove('hidden');
        saveProgress({
            completed: true,
            finalScore: successRate,
            date: new Date().toLocaleString('zh-TW')
        });
    } else {
        completeMessage.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        const remainingScore = 80 - successRate;
        alert(`你的成功率是 ${successRate}%，還需要提高 ${remainingScore}%。\n讓我們重新開始！`);
        startQuiz();
    }
}

// ─── 統計 ────────────────────────────────────────────────
function viewStats() {
    const progress = loadProgress();
    const statsContent = document.getElementById('statsContent');

    if (!progress.completed) {
        statsContent.innerHTML = `
            <p>你還沒有完成課程。</p>
            <p><a href="#" onclick="startLesson(); return false;">開始學習</a></p>
        `;
    } else {
        statsContent.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">最終成績</span>
                <span class="stat-value">${progress.finalScore}%</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">完成日期</span>
                <span class="stat-value">${progress.date}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">狀態</span>
                <span class="stat-value">✅ 已完成</span>
            </div>
        `;
    }
    showScreen('statsPage');
}

function resetProgress() {
    if (confirm('確定要重置所有進度嗎？')) {
        localStorage.removeItem(STORAGE_KEY);
        alert('進度已重置');
        goBack();
    }
}

function saveProgress(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadProgress() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : { completed: false };
}

window.addEventListener('load', () => {
    showScreen('mainMenu');
});
