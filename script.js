/**
 * @author Ravi Raushan
 * @project Mock OMR Sheet - Main Application Logic
 * @date August 2025
 * @description This script powers the Mock OMR Sheet application. It handles UI interactions,
 * state management, file parsing, grading logic, and PDF report generation.
 */

// --- Global Configuration for Libraries ---
// Required configuration for PDF.js to specify its worker script location.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js`;

// --- DOM Element References ---
// A best practice to get all element references at the top for easy access and management.
const generateBtn = document.getElementById('generate-btn');
const questionCountInput = document.getElementById('question-count');
const correctMarksInput = document.getElementById('correct-marks');
const wrongMarksInput = document.getElementById('wrong-marks');
const configError = document.getElementById('config-error');
const omrContainer = document.getElementById('omr-container');
const omrSheet = document.getElementById('omr-sheet');
const timerDisplay = document.getElementById('timer-display');
const checkBtn = document.getElementById('check-btn');
const resetBtn = document.getElementById('reset-btn');
const savePdfBtn = document.getElementById('save-pdf-btn');
const fileUpload = document.getElementById('file-upload');
const manualKeyInput = document.getElementById('manual-key');
const checkError = document.getElementById('check-error');
const statusMessageEl = document.getElementById('status-message');
const resultsDisplay = document.getElementById('results-display');
const scoreEl = document.getElementById('score');
const totalMarksInfoEl = document.getElementById('total-marks-info');
const timeTakenInfoEl = document.getElementById('time-taken-info');
const correctCountEl = document.getElementById('correct-count');
const incorrectCountEl = document.getElementById('incorrect-count');
const unansweredCountEl = document.getElementById('unanswered-count');
const marksBreakdownEl = document.getElementById('marks-breakdown');
const correctMarksTotalEl = document.getElementById('correct-marks-total');
const incorrectMarksTotalEl = document.getElementById('incorrect-marks-total');
const formatModal = document.getElementById('format-modal');
const confirmModal = document.getElementById('confirm-modal');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmNoBtn = document.getElementById('confirm-no-btn');

// --- State Variables ---
// Variables to hold the application's current state.
let totalQuestions = 0;
let correctMarks = null;
let wrongMarks = null;
let answerKey = {};
let timerInterval = null;
let startTime = 0;
let isGraded = false; // Flag to track if the sheet has been graded

// --- Event Listeners ---
// Centralized event listener setup for all user interactions.
generateBtn.addEventListener('click', generateOMRSheet);
questionCountInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generateOMRSheet(); });
checkBtn.addEventListener('click', handleCheckAnswers);
resetBtn.addEventListener('click', resetEverything);
savePdfBtn.addEventListener('click', saveResultAsPDF);
fileUpload.addEventListener('change', handleFileUpload);
confirmYesBtn.addEventListener('click', handleConfirmProceed);
confirmNoBtn.addEventListener('click', () => confirmModal.classList.add('hidden'));

// --- Core Application Logic ---

/**
 * Generates the OMR sheet based on user input and starts the timer.
 */
function generateOMRSheet() {
    const count = parseInt(questionCountInput.value, 10);
    if (isNaN(count) || count < 1 || count > 200) {
        showError(configError, 'Please enter a number between 1 and 200.');
        return;
    }
    hideError(configError);
    totalQuestions = count;

    // Parse and store the marking scheme, ensuring wrong marks are negative.
    correctMarks = correctMarksInput.value ? parseFloat(correctMarksInput.value) : null;
    wrongMarks = wrongMarksInput.value ? parseFloat(wrongMarksInput.value) : null;
    if (wrongMarks !== null && wrongMarks > 0) wrongMarks = -wrongMarks;

    // Dynamically create and append question rows.
    omrSheet.innerHTML = '';
    for (let i = 1; i <= totalQuestions; i++) {
        const questionRow = createQuestionRow(i);
        omrSheet.appendChild(questionRow);
        const clearButton = questionRow.querySelector('.clear-btn');
        
        // Add event listener to the clear button.
        clearButton.addEventListener('click', () => clearSelection(i));
        
        // Show the clear button only when a radio button is selected.
        questionRow.addEventListener('change', () => {
            const isChecked = questionRow.querySelector(`input[name="question-${i}"]:checked`);
            clearButton.classList.toggle('hidden', !isChecked);
        });
    }

    // Display the OMR container and start the test.
    omrContainer.classList.remove('hidden');
    omrContainer.classList.add('fade-in');
    resetOMRState();
    startTimer();
}

/**
 * Creates a single question row element with radio buttons and a clear button.
 * @param {number} i - The question number.
 * @returns {HTMLElement} The created div element for the question row.
 */
function createQuestionRow(i) {
    const questionRow = document.createElement('div');
    questionRow.className = 'question-row flex items-center justify-between p-3 rounded-lg transition-colors duration-300';
    questionRow.id = `q-row-${i}`;
    const optionsHTML = ['A', 'B', 'C', 'D'].map(option => `
        <div class="flex items-center space-x-2">
            <input type="radio" name="question-${i}" id="q${i}-opt${option}" value="${option}" class="omr-radio">
            <label for="q${i}-opt${option}" class="font-semibold cursor-pointer">${option}</label>
        </div>`).join('');
    questionRow.innerHTML = `
        <div class="flex items-center">
            <span class="font-bold text-slate-700 w-10 text-right mr-4">${i}.</span>
        </div>
        <div class="flex items-center space-x-4 md:space-x-6">
            ${optionsHTML}
            <button class="text-sm font-medium text-red-500 hover:text-red-700 hidden clear-btn">Clear</button>
        </div>`;
    return questionRow;
}

/**
 * Clears the selected radio button for a specific question.
 * @param {number} questionNumber - The number of the question to clear.
 */
function clearSelection(questionNumber) {
    const row = document.getElementById(`q-row-${questionNumber}`);
    document.querySelectorAll(`input[name="question-${questionNumber}"]`).forEach(radio => {
        radio.checked = false;
    });
    // Hide the clear button after clearing the selection.
    row.querySelector('.clear-btn').classList.add('hidden');
}

/**
 * Handles the primary action of the "Finish & Check" button.
 * It validates if an answer key is present and either grades the sheet or shows a confirmation modal.
 */
function handleCheckAnswers() {
    const manualKey = manualKeyInput.value.trim().toUpperCase();
    const hasAnswerKey = manualKey || Object.keys(answerKey).length > 0;

    if (hasAnswerKey) {
        if (manualKey) {
            if (manualKey.length !== totalQuestions) {
                showError(checkError, `Manual key has ${manualKey.length} answers, but there are ${totalQuestions} questions.`);
                return;
            }
            answerKey = {};
            for (let i = 0; i < manualKey.length; i++) answerKey[i + 1] = manualKey[i];
        } else if (Object.keys(answerKey).length !== totalQuestions) {
            showError(checkError, `Uploaded key has ${Object.keys(answerKey).length} answers, but there are ${totalQuestions} questions.`);
            return;
        }
        gradeSheet();
    } else {
        confirmModal.classList.remove('hidden');
    }
}

/**
 * Grades the sheet, calculates the score, stops the timer, and updates the UI.
 */
function gradeSheet() {
    stopTimer();
    hideError(checkError);
    isGraded = true;
    let correct = 0, incorrect = 0, unanswered = 0;

    // Iterate through each question to check the answer.
    for (let i = 1; i <= totalQuestions; i++) {
        const row = document.getElementById(`q-row-${i}`);
        row.classList.remove('correct', 'incorrect');
        const selectedOption = document.querySelector(`input[name="question-${i}"]:checked`);
        const correctAnswer = answerKey[i];

        // Disable radio buttons and hide clear button after grading.
        document.querySelectorAll(`input[name="question-${i}"]`).forEach(radio => radio.disabled = true);
        row.querySelector('.clear-btn').classList.add('hidden');

        if (!selectedOption) unanswered++;
        else if (selectedOption.value === correctAnswer) {
            correct++;
            row.classList.add('correct');
        } else {
            incorrect++;
            row.classList.add('incorrect');
            // Highlight the correct answer if the user was wrong.
            const correctLabel = row.querySelector(`label[for="q${i}-opt${correctAnswer}"]`);
            if (correctLabel) correctLabel.classList.add('ring-2', 'ring-green-500', 'rounded-md', 'p-1');
        }
    }

    // Calculate and display the score based on the marking scheme.
    if (correctMarks !== null) {
        const totalScore = (correct * correctMarks) + (incorrect * (wrongMarks || 0));
        const maxScore = totalQuestions * correctMarks;
        scoreEl.textContent = `${totalScore}`;
        totalMarksInfoEl.textContent = `out of ${maxScore}`;
        correctMarksTotalEl.textContent = `Gained: ${correct * correctMarks} marks`;
        incorrectMarksTotalEl.textContent = `| Lost: ${incorrect * (wrongMarks || 0)} marks`;
        marksBreakdownEl.classList.remove('hidden');
    } else {
        scoreEl.textContent = `${correct} / ${totalQuestions}`;
        totalMarksInfoEl.textContent = ``;
        marksBreakdownEl.classList.add('hidden');
    }

    // Update the result counts and show the results panel.
    correctCountEl.textContent = `Correct: ${correct}`;
    incorrectCountEl.textContent = `Incorrect: ${incorrect}`;
    unansweredCountEl.textContent = `Unanswered: ${unanswered}`;
    resultsDisplay.classList.remove('hidden');
    resultsDisplay.classList.add('fade-in');
    savePdfBtn.classList.remove('hidden');
}

// --- PDF Generation and User Confirmation ---

/**
 * Handles the case where the user proceeds without an answer key.
 * It prepares the UI for saving the marked (but ungraded) sheet.
 */
function handleConfirmProceed() {
    confirmModal.classList.add('hidden');
    stopTimer();
    isGraded = false;
    document.querySelectorAll('input[type="radio"]').forEach(radio => radio.disabled = true);
    document.querySelectorAll('.clear-btn').forEach(btn => btn.classList.add('hidden'));
    showStatusMessage('You can now save your marked sheet.', 'success');
    // Change the "Finish & Check" button to a save button.
    checkBtn.textContent = 'Save Marked Sheet as PDF';
    checkBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    checkBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
    checkBtn.onclick = () => saveResultAsPDF();
}

/**
 * Generates a high-quality, vector-based PDF of the test report.
 * This function builds the PDF natively to avoid blurriness and large file sizes.
 */
async function saveResultAsPDF() {
    showStatusMessage('Generating PDF...', 'success');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const margin = 15;
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPos = 20;

    // --- Draw Header and Results as Text ---
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("OMR Test Report", pdfWidth / 2, yPos, { align: 'center' });
    yPos += 12;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);

    if (isGraded) {
        pdf.text(`Your Score: ${scoreEl.textContent.trim()} ${totalMarksInfoEl.textContent.trim()}`, margin, yPos);
        yPos += 7;
        pdf.text(timeTakenInfoEl.textContent.trim(), margin, yPos);
        yPos += 10;
        pdf.text(`${correctCountEl.textContent.trim()} | ${incorrectCountEl.textContent.trim()} | ${unansweredCountEl.textContent.trim()}`, margin, yPos);
        yPos += 7;
        if (correctMarks !== null) {
            pdf.text(`${correctMarksTotalEl.textContent.trim()} | ${incorrectMarksTotalEl.textContent.trim().substring(2)}`, margin, yPos);
            yPos += 10;
        }
    } else {
        pdf.text(timeTakenInfoEl.textContent.trim(), margin, yPos);
        yPos += 10;
    }

    pdf.setLineWidth(0.2);
    pdf.line(margin, yPos, pdfWidth - margin, yPos);
    yPos += 10;

    // --- Draw OMR Sheet Natively (Vector-based) ---
    const questionSpacing = 10;
    const optionSpacing = 25;
    const circleRadius = 3;

    for (let i = 1; i <= totalQuestions; i++) {
        // Check for page break to handle long lists of questions.
        if (yPos > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
        }

        const selectedOption = document.querySelector(`input[name="question-${i}"]:checked`);
        const userAnswer = selectedOption ? selectedOption.value : null;
        const correctAnswer = answerKey[i];

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text(`${i}.`, margin, yPos + circleRadius);

        let xPos = margin + 20;
        ['A', 'B', 'C', 'D'].forEach(option => {
            pdf.setFont("helvetica", "normal");
            pdf.text(option, xPos, yPos + circleRadius);

            const circleX = xPos + 5;
            const circleY = yPos + circleRadius - 1;

            pdf.setDrawColor(0);
            pdf.setFillColor(255, 255, 255);
            let drawStyle = 'D'; // Default: Draw outline

            if (userAnswer === option) {
                if (isGraded) {
                    if (userAnswer === correctAnswer) pdf.setFillColor(22, 163, 74); // Correct: Green
                    else pdf.setFillColor(220, 38, 38); // Incorrect: Red
                } else {
                    pdf.setFillColor(37, 99, 235); // Marked but ungraded: Blue
                }
                drawStyle = 'FD'; // Fill and Draw
            }

            pdf.circle(circleX, circleY, circleRadius, drawStyle);

            if (isGraded && userAnswer !== correctAnswer && option === correctAnswer) {
                pdf.setDrawColor(22, 163, 74); // Green ring for correct answer
                pdf.setLineWidth(0.5);
                pdf.circle(circleX, circleY, circleRadius + 0.5, 'D');
                pdf.setLineWidth(0.2); // Reset line width
            }
            xPos += optionSpacing;
        });
        yPos += questionSpacing;
    }

    pdf.save('omr_report.pdf');
    hideStatusMessage();
}


        // --- Timer Functions ---
        
        function startTimer() {
            clearInterval(timerInterval);
            startTime = Date.now();
            timerInterval = setInterval(() => {
                timerDisplay.textContent = formatTime(Date.now() - startTime);
            }, 1000);
        }

        function stopTimer() {
            clearInterval(timerInterval);
            timeTakenInfoEl.textContent = `Time Taken: ${formatTime(Date.now() - startTime)}`;
        }

        function formatTime(ms) {
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const seconds = (totalSeconds % 60).toString().padStart(2, '0');
            return `${minutes}:${seconds}`;
        }

        // --- Reset and State Management ---

        /**
         * Resets the entire application to its initial state.
         */
        function resetEverything() {
            questionCountInput.value = '';
            correctMarksInput.value = '';
            wrongMarksInput.value = '';
            omrContainer.classList.add('hidden');
            omrSheet.innerHTML = '';
            totalQuestions = 0;
            correctMarks = null;
            wrongMarks = null;
            resetOMRState();
            clearInterval(timerInterval);
            timerDisplay.textContent = '00:00';
        }
        
        /**
         * Resets only the OMR sheet state (answers, results, etc.).
         */
        function resetOMRState() {
            answerKey = {};
            fileUpload.value = '';
            manualKeyInput.value = '';
            resultsDisplay.classList.add('hidden');
            marksBreakdownEl.classList.add('hidden');
            savePdfBtn.classList.add('hidden');
            hideError(checkError);
            hideStatusMessage();
            isGraded = false;
            
            // Restore the "Finish & Check" button to its original state.
            checkBtn.textContent = 'Finish & Check';
            checkBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            checkBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
            checkBtn.onclick = handleCheckAnswers;
            
            // Clear all radio buttons and result styling.
            document.querySelectorAll('.question-row').forEach(row => {
                row.classList.remove('correct', 'incorrect');
                row.querySelectorAll('input[type="radio"]').forEach(radio => {
                    radio.disabled = false;
                    radio.checked = false;
                });
                const hintLabel = row.querySelector('.ring-2');
                if(hintLabel) hintLabel.classList.remove('ring-2', 'ring-green-500', 'rounded-md', 'p-1');
            });
        }
        
        // --- File Handling and Parsing ---

        /**
         * Handles the file upload event and directs the file to the correct parser.
         * @param {Event} event - The file input change event.
         */
        function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            const extension = file.name.split('.').pop().toLowerCase();

            if (extension === 'xlsx' || extension === 'xls') {
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                        parseAnswerKeyFromExcel(json);
                    } catch (err) {
                        showError(checkError, 'Failed to process Excel file.');
                    }
                };
                reader.readAsArrayBuffer(file);
            } else if (extension === 'pdf') {
                reader.onload = (e) => {
                    const typedarray = new Uint8Array(e.target.result);
                    pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                        let pagesPromises = [];
                        for (let i = 1; i <= pdf.numPages; i++) {
                            pagesPromises.push(pdf.getPage(i).then(page => page.getTextContent()));
                        }
                        return Promise.all(pagesPromises);
                    }).then(textContents => {
                        let fullText = '';
                        textContents.forEach(content => {
                            content.items.forEach(item => { fullText += item.str + ' '; });
                            fullText += '\n';
                        });
                        parseAnswerKeyFromText(fullText);
                    }).catch(() => showError(checkError, 'Failed to process PDF file.'));
                };
                reader.readAsArrayBuffer(file);
            } else {
                showError(checkError, 'Unsupported file type. Please use .xlsx, .xls, or .pdf');
            }
        }

        /**
         * Parses an answer key from data extracted from an Excel file.
         * @param {Array<Array<any>>} data - The sheet data from SheetJS.
         */
        function parseAnswerKeyFromExcel(data) {
            const newKey = {};
            let parsedCount = 0;
            data.forEach(row => {
                const qNum = parseInt(row[0], 10);
                const answer = String(row[1]).trim().toUpperCase();
                if (!isNaN(qNum) && ['A', 'B', 'C', 'D'].includes(answer)) {
                    newKey[qNum] = answer;
                    parsedCount++;
                }
            });
            if(parsedCount > 0) {
                answerKey = newKey;
                manualKeyInput.value = '';
                hideError(checkError);
                showStatusMessage(`${parsedCount} answers loaded. Click "Finish & Check" to grade.`, 'success');
            } else {
                showError(checkError, 'Could not find valid answers in the Excel file.');
            }
        }
        
        /**
         * Parses an answer key from text extracted from a PDF file using a regular expression.
         * @param {string} text - The text content of the PDF.
         */
        function parseAnswerKeyFromText(text) {
            const regex = /(\d+)\s*[:.-]?\s*([A-D])\b/g;
            let match;
            const newKey = {};
            let parsedCount = 0;
            while ((match = regex.exec(text)) !== null) {
                newKey[parseInt(match[1], 10)] = match[2].toUpperCase();
                parsedCount++;
            }
            
            if(parsedCount > 0) {
                answerKey = newKey;
                manualKeyInput.value = '';
                hideError(checkError);
                showStatusMessage(`${parsedCount} answers loaded. Click "Finish & Check" to grade.`, 'success');
            } else {
                showError(checkError, 'Could not find valid answers in the PDF.');
            }
        }

        // --- UI Helper Functions ---
        function showError(element, message) {
            element.textContent = message;
            element.classList.remove('hidden');
        }
        function hideError(element) {
            element.classList.add('hidden');
        }
        function showStatusMessage(message, type = 'success') {
            statusMessageEl.textContent = message;
            statusMessageEl.className = `p-3 mb-4 rounded-lg text-center font-semibold ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
            statusMessageEl.classList.remove('hidden');
        }
        function hideStatusMessage() {
            statusMessageEl.classList.add('hidden');
        }
        function showFormatInfo() {
            formatModal.classList.remove('hidden');
        }
        function hideFormatInfo() {
            formatModal.classList.add('hidden');
        }
