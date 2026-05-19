const assert = require("node:assert/strict");
const { practiceExamEngine } = require("./script.js");

const choiceQuestion = {
  type: "choice",
  answers: ["Alpha", "Bravo", "Charlie"],
  correct: 1
};

const multiSelectQuestion = {
  type: "multi-select",
  answers: ["PoLP", "Admin all users", "Layered defense", "Restrict services"],
  correct: [0, 2, 3],
  requiredSelections: 3
};

const dropdownQuestion = {
  type: "dropdown",
  prompts: [
    { label: "First", correct: "A" },
    { label: "Second", correct: "B" },
    { label: "Third", correct: "C" }
  ]
};

const matchingQuestion = {
  type: "matching",
  pairs: [
    { prompt: "Discover", correct: "NMAP" },
    { prompt: "Prioritize", correct: "CVSS" },
    { prompt: "Remediate", correct: "Patch Management Software" }
  ]
};

assert.equal(practiceExamEngine.getPreviousIndex(0), 0, "Back navigation must stop at question 1.");
assert.equal(practiceExamEngine.getPreviousIndex(3), 2, "Back navigation should move to the previous question.");
assert.equal(practiceExamEngine.getNextIndex(2, 4), 3, "Next navigation should move forward.");
assert.equal(practiceExamEngine.getNextIndex(3, 4), 3, "Next navigation should stop at the last question.");

let flags = [false, false, false];
flags = practiceExamEngine.toggleFlag(flags, 1);
assert.equal(flags[1], true, "Flagging should mark a question.");
flags = practiceExamEngine.toggleFlag(flags, 1);
assert.equal(flags[1], false, "Flagging again should unflag a question.");

const reviewItems = practiceExamEngine.buildReviewItems(
  [choiceQuestion, multiSelectQuestion],
  [1, { type: "multi-select", values: [0, 2, 3] }],
  [false, true],
  1
);
assert.equal(reviewItems[1].index, 1, "Review navigation should keep the target question index.");
assert.equal(reviewItems[1].isCurrent, true, "Review should highlight the current question.");
assert.equal(reviewItems[1].isFlagged, true, "Review should show flagged questions.");
assert.equal(reviewItems[0].isAnswered, true, "Review should show answered questions.");

assert.equal(practiceExamEngine.shouldRequestFullscreen({
  activeExam: true,
  finished: false,
  hasRequestFullscreen: true
}), true, "Fullscreen should be requested for an active unfinished exam.");
assert.equal(practiceExamEngine.shouldRequestFullscreen({
  activeExam: true,
  finished: true,
  hasRequestFullscreen: true
}), false, "Fullscreen should not be requested after an exam is finished.");

assert.equal(practiceExamEngine.getQuestionPointValue(choiceQuestion), 1, "Single-answer questions are worth one point.");
assert.equal(practiceExamEngine.getEarnedPoints(choiceQuestion, 1), 1, "Correct single-answer selection earns one point.");
assert.equal(practiceExamEngine.getEarnedPoints(choiceQuestion, 0), 0, "Wrong single-answer selection earns no points.");

assert.equal(practiceExamEngine.getQuestionPointValue(multiSelectQuestion), 3, "Multi-answer questions are weighted by correct answers.");
assert.equal(
  practiceExamEngine.getEarnedPoints(multiSelectQuestion, { type: "multi-select", values: [0, 1, 3] }),
  2,
  "Multi-answer scoring should award only correct selected answers."
);

assert.equal(practiceExamEngine.getQuestionPointValue(dropdownQuestion), 3, "Dropdown questions are weighted by dropdown count.");
assert.equal(
  practiceExamEngine.getEarnedPoints(dropdownQuestion, { type: "dropdown", values: ["A", "Wrong", "C"] }),
  2,
  "Dropdown scoring should award partial credit per correct dropdown."
);

assert.equal(practiceExamEngine.getQuestionPointValue(matchingQuestion), 3, "Matching questions are weighted by match count.");
assert.equal(
  practiceExamEngine.getEarnedPoints(matchingQuestion, { type: "matching", matches: { 0: "NMAP", 1: "Wrong", 2: "Patch Management Software" } }),
  2,
  "Matching scoring should award partial credit per correct match."
);

console.log("PASS: exam navigation, flags, review, fullscreen lifecycle, and weighted partial-credit scoring checks passed.");
