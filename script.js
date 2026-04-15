// K線教學軟體
// 狀態管理
let currentPage = 'mainMenu';
let currentLessonIndex = 0;
let quizData = [];
let quizIndex = 0;
let correctAnswers = 0;
let totalAnswers = 0;
let selectedAnswer = null;

// 本地存儲
const STORAGE_KEY = 'klineProgress';

// 教學內容
const lessons = [
    {
        title: '第 1 課：什麼是 K線？',
        content: `
            <div class="lesson">
                <h3>K線的基本概念</h3>
                <p>K線（蠟燭圖）是股票技術分析的基礎，它用四個價格來表示一段時間內的股價變化：</p>
                <p><strong>開盤價</strong>：該時段開始時的股價</p>
                <p><strong>最高價</strong>：該時段內的最高股價</p>
                <p><strong>最低價</strong>：該時段內的最低股價</p>
                <p><strong>收盤價</strong>：該時段結束時的股價</p>

                <h3>K線的組成</h3>
                <div class="lesson-example">
                <strong>實體</strong>：開盤價和收盤價之間的矩形部分<br>
                <strong>上影線</strong>：實體上方的細線（最高價 - 收盤價）<br>
                <strong>下影線</strong>：實體下方的細線（開盤價 - 最低價）
                </div>

                <h3>K線的顏色</h3>
                <p><strong style="color: red;">紅色/陽線</strong>：收盤價 > 開盤價（上漲）</p>
                <p><strong style="color: green;">綠色/陰線</strong>：收盤價 < 開盤價（下跌）</p>
            </div>
        `
    },
    {
        title: '第 2 課：K線的基本形態',
        content: `
            <div class="lesson">
                <h3>常見的 K線形態</h3>

                <p><strong>1. 陽線（上漲）</strong></p>
                <div class="lesson-example">
                ▁▂▃▄▅▇<br>
                特徵：收盤價 > 開盤價，表示買方強勢
                </div>

                <p><strong>2. 陰線（下跌）</strong></p>
                <div class="lesson-example">
                ▇▅▄▃▂▁<br>
                特徵：收盤價 < 開盤價，表示賣方強勢
                </div>

                <p><strong>3. 十字線</strong></p>
                <div class="lesson-example">
                ┃<br>
                特徵：開盤價 ≈ 收盤價，買賣雙方力量均衡
                </div>

                <p><strong>4. 錘子線</strong></p>
                <div class="lesson-example">
                ▂<br>
                ┃<br>
                ▄<br>
                特徵：下影線長，實體小，常見於底部（看漲信號）
                </div>

                <p><strong>5. 倒錘子線</strong></p>
                <div class="lesson-example">
                ▄<br>
                ┃<br>
                ▂<br>
                特徵：上影線長，實體小，常見於頂部（看跌信號）
                </div>
            </div>
        `
    },
    {
        title: '第 3 課：K線與趨勢',
        content: `
            <div class="lesson">
                <h3>上升趨勢的特徵</h3>
                <div class="lesson-example">
                ▂▃▄▅▆▇<br>
                特徵：連續陽線，高點和低點逐漸上升
                </div>

                <p><strong>買點信號：</strong>在支撐位附近的陽線</p>

                <h3>下降趨勢的特徵</h3>
                <div class="lesson-example">
                ▇▆▅▄▃▂<br>
                特徵：連續陰線，高點和低點逐漸下降
                </div>

                <p><strong>賣點信號：</strong>在阻力位附近的陰線</p>

                <h3>震盪趨勢的特徵</h3>
                <div class="lesson-example">
                ▂▅▂▅▂▅<br>
                特徵：陰陽交替，在支撐和阻力之間反覆震盪
                </div>

                <p><strong>交易策略：</strong>在底部買，在頂部賣
            </div>
        `
    }
];

// 測驗題庫
const quizBank = [
    {
        type: 'basic',
        title: '基礎判讀 #1',
        kline: '▇▅▄▃▂▁',
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
        kline: '▁▂▃▄▅▇',
        question: '這根 K线代表什麼？',
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
        kline: '▂\n┃\n▄',
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
        kline: '▄\n┃\n▂',
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
        kline: '▂▃▄▅▆▇',
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
        kline: '▇▆▅▄▃▂',
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
        kline: '▂▅▂▅▂▅',
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
        kline: '▂▃▄▅▆▇→?',
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
        kline: '▇▆▅▄▃▂→?',
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
        kline: '▂▅▂▅▂▅→▂',
        question: '在震盪趨勢中看到陰線，這是什麼信號？',
        options: [
            { text: '強烈買入信號', correct: false },
            { text: '強烈賣出信號', correct: false },
            { text: '回到支撐位，可以考慮買入', correct: true },
            { text: '應該清倉', correct: false }
        ]
    }
];

// 頁面導航
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenName).classList.remove('hidden');
    currentPage = screenName;
}

function goBack() {
    showScreen('mainMenu');
}

// 開始教學
function startLesson() {
    currentLessonIndex = 0;
    displayLesson();
    showScreen('lessonMode');
}

// 顯示教學內容
function displayLesson() {
    if (currentLessonIndex < lessons.length) {
        const lesson = lessons[currentLessonIndex];
        const content = document.getElementById('lessonContent');
        content.innerHTML = `<h2>${lesson.title}</h2>${lesson.content}`;
    }
}

// 下一課
function nextLesson() {
    currentLessonIndex++;
    if (currentLessonIndex >= lessons.length) {
        startQuiz();
    } else {
        displayLesson();
    }
}

// 開始測驗
function startQuiz() {
    // 隨機打亂並選擇 10 題
    const shuffled = quizBank.sort(() => Math.random() - 0.5).slice(0, 10);
    quizData = shuffled;
    quizIndex = 0;
    correctAnswers = 0;
    totalAnswers = 0;
    selectedAnswer = null;

    showScreen('quizMode');
    displayQuiz();
}

// 顯示測驗
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

    // 顯示 K線
    const klineDisplay = document.getElementById('klineDisplay');
    klineDisplay.innerHTML = quiz.kline.split('\n').map(line =>
        `<div class="kline-sample">${line}</div>`
    ).join('');

    // 顯示選項
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = quiz.options.map((opt, idx) => `
        <label class="option">
            <input type="radio" name="answer" value="${idx}" onchange="selectAnswer(${idx})">
            ${opt.text}
        </label>
    `).join('');

    // 隱藏反饋
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('submitBtn').classList.remove('hidden');
    document.getElementById('nextBtn').classList.add('hidden');
    selectedAnswer = null;
}

// 選擇答案
function selectAnswer(idx) {
    selectedAnswer = idx;
    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    document.querySelectorAll('.option')[idx].classList.add('selected');
}

// 提交答案
function submitAnswer() {
    if (selectedAnswer === null) {
        alert('請選擇答案');
        return;
    }

    const quiz = quizData[quizIndex];
    const isCorrect = quiz.options[selectedAnswer].correct;

    totalAnswers++;
    if (isCorrect) {
        correctAnswers++;
    }

    // 顯示反饋
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

    // 更新選項樣式
    document.querySelectorAll('.option').forEach((opt, idx) => {
        opt.classList.remove('selected');
        if (idx === selectedAnswer) {
            opt.classList.add(isCorrect ? 'correct' : 'incorrect');
        } else if (idx === quiz.options.findIndex(o => o.correct)) {
            opt.classList.add('correct');
        }
    });

    // 顯示下一題按鈕
    document.getElementById('submitBtn').classList.add('hidden');
    document.getElementById('nextBtn').classList.remove('hidden');
}

// 下一題
function nextQuiz() {
    quizIndex++;
    selectedAnswer = null;

    if (quizIndex >= quizData.length) {
        showCompletionScreen();
    } else {
        displayQuiz();
    }
}

// 顯示完成螢幕
function showCompletionScreen() {
    const successRate = Math.round((correctAnswers / totalAnswers) * 100);
    document.getElementById('finalScore').textContent = successRate;

    const quizContainer = document.getElementById('quizContainer');
    const completeMessage = document.getElementById('completeMessage');

    if (successRate >= 80) {
        quizContainer.classList.add('hidden');
        completeMessage.classList.remove('hidden');

        // 保存進度
        saveProgress({
            completed: true,
            finalScore: successRate,
            date: new Date().toLocaleString('zh-TW')
        });
    } else {
        // 重新開始測驗
        completeMessage.classList.add('hidden');
        quizContainer.classList.remove('hidden');

        const remainingScore = 80 - successRate;
        alert(`你的成功率是 ${successRate}%，還需要提高 ${remainingScore}%。\n讓我們重新開始！`);
        startQuiz();
    }
}

// 統計頁面
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

// 重置進度
function resetProgress() {
    if (confirm('確定要重置所有進度嗎？')) {
        localStorage.removeItem(STORAGE_KEY);
        alert('進度已重置');
        goBack();
    }
}

// 本地存儲
function saveProgress(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadProgress() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : { completed: false };
}

// 初始化
window.addEventListener('load', () => {
    showScreen('mainMenu');
});
