import {isKnownAT, getATCommands, getModeInstructions} from './at-commands.mjs';

const DEFAULT_AT = 'JAWS';
const DEFAULT_RESULTS = ['All Pass', 'All Fail', 'Some Fail'];

const TEST_HTML_OUTLINE = `
<main>
  <section id='errors' style='display:none'><h2>Test cannot be performed due to error(s)!</h2><ul></ul><hr></section>
  <section id='instructions'></section>
  <section id='record-results'></section>
</main>
`;
const PAGE_STYLES = `
  table {
    border-collapse: collapse;
    margin-bottom: 1em;
  }

  table, td, th {
    border: 1px solid black;
  }

  td {
    padding: .5em;
  }

  table.record-results tr:first-child {
    font-weight: bold;
  }

  table .required:not(.highlight-required) {
    display: none;
  }

  table .required.highlight-required {
    color: red;
  }

  fieldset.highlight-required {
    border-color: red;
  }

  fieldset .highlight-required {
    color: red;
  }

`;

const allBehaviors = [];
const allBehaviorResults = [];
const errors = [];
let currentTestedBehavior = 0;
let testPageUri;
let testPageWindow;

let at = DEFAULT_AT;

let params = (new URL(document.location)).searchParams;
for (const [key, value] of params) {
  if (key === 'at') {
    let requestedAT = value;
    if (isKnownAT(requestedAT)) {
      at = isKnownAT(requestedAT);
    }
    else {
      errors.push(`Harness does not have commands for the requested assistive technology ('${requestedAT}'), showing commands for assitive technology '${DEFAULT_AT}' instead. To test '${requestedAT}', please contribute command mappings to this project.`);
    }
  }
}



function openTestPagePopup() {
  testPageWindow = window.open(testPageUri, '_blank', 'toolbar=0,location=0,menubar=0,width=400,height=400');

  document.getElementById('open-test-page').disabled = true;

  // If the window is closed, re-enable open popup button
  testPageWindow.onunload = function(event) {
    window.setTimeout(() => {
      if (testPageWindow.closed) {
	testPageWindow = undefined;
	document.getElementById('open-test-page').disabled = false;
      }
    }, 100);

  };

  executeScriptInTestPage();
}

function putTestPageWindowIntoCorrectState() {
  // testPageWindow.location.reload(); // TODO: Address the race condition this causes with script execution.
  executeScriptInTestPage();
}

function executeScriptInTestPage() {
  let setupTestPage = allBehaviors[currentTestedBehavior].setupTestPage;
  if (setupTestPage) {
    if (testPageWindow.document.readyState !== 'complete') {
      window.setTimeout(() => {
	executeScriptInTestPage();
      }, 100);
      return;
    }

    setupTestPage(testPageWindow.document);
  }
}

export function verifyATBehavoir(behavior) {
  for (let m = 0; m < behavior.mode.length; m++) {
    let newBehavior = Object.assign({}, behavior, { mode: behavior.mode[m] });
    newBehavior.commands = getATCommands(behavior.mode[m], behavior.task, at);
    if (newBehavior.commands.length) {
      allBehaviors.push(newBehavior);
    }
  }
}

export function displayTestPageAndInstructions(testPage) {
  testPageUri = testPage;

  if (document.readyState !== 'complete') {
    window.setTimeout(() => {
      displayTestPageAndInstructions(testPage);
    }, 100);
    return;
  }

  document.querySelector('html').setAttribute('lang', 'en');
  document.body.innerHTML = (TEST_HTML_OUTLINE);
  var style = document.createElement('style');
  style.innerHTML = PAGE_STYLES;
  document.head.appendChild(style);

  showUserError();

  if (allBehaviors.length > 0) {
    displayInstructionsForBehaviorTest(0);
  }
}

function displayInstructionsForBehaviorTest(behaviorId) {
  // First, execute necesary set up script in test page if the test page is open from a previous behavior test
  if (testPageWindow) {
    putTestPageWindowIntoCorrectState();
  }

  const totalBehaviors = allBehaviors.length;
  const behavior = allBehaviors[behaviorId];

  const mode = behavior.mode;
  const modeInstructions = getModeInstructions(mode, at);
  const userInstructions = behavior.specific_user_instruction;
  const commands = behavior.commands;
  const assertions = behavior.assertions;

  let instructionsEl = document.getElementById('instructions');
  instructionsEl.innerHTML = `
<h1 id="behavior-header" tabindex="0">Testing behavior ${behaviorId+1} of ${totalBehaviors}</h1>
<p>How does ${at} respond after task "${userInstructions}" is performed in ${mode} mode?</p>
<h2>Test instructions</h2>
<ol>
  <li><em>${modeInstructions}</em></li>
  <li>Then, <em>${userInstructions}</em> using each of the following <emp>${at}<emp> controls:
    <ul id='at_controls' aria-label='AT controls'>
    </ul>
  </li>
</ol>
<h3>Success Criteria</h3>
<p>For this test to pass, the following assertions must be met for every possible command:</p>
<ul id='assertions'>
</ul>
`;

  for (let command of commands) {
    let el = document.createElement('li');
    el.innerHTML = `<em>${command}</em>`;
    document.getElementById('at_controls').append(el);
  }

  for (let assertion of assertions) {
    let el = document.createElement('li');
    el.innerHTML = `<em>${assertion}</em>`;
    document.getElementById('assertions').append(el);
  }

  let openButton = document.createElement('button');
  openButton.id = 'open-test-page';
  openButton.innerText = "Open Test Page";
  openButton.addEventListener('click', openTestPagePopup);
  if (testPageWindow) {
    openButton.disabled = true;
  }
  document.getElementById('instructions').append(openButton);

  let recordResults = `<h2>Record Results</h2><p>${document.title}</p>`;

  for (let c = 0; c < commands.length; c++) {
    recordResults += `<h3 id="header-cmd-${c}">Results for command: '${commands[c]}'</h3>`;
    recordResults += `
<p>
  <fieldset id="cmd-${c}-summary">
    <label for="speechoutput-${c}">Relevant speech output after command <span class="required">(required)</span>:</label>
    <input type="text" id="speechoutput-${c}">
    <div>
      <input type="radio" id="allcorrect-${c}" class="allcorrect" name="allresults-${c}">
      <label for="allcorrect-${c}">All assertions have been meet with this output</label>
    </div>
    <div>
      <input type="radio" id="allincomplete-${c}" class="allincomplete" name="allresults-${c}">
      <label for="allincomplete-${c}">All assertions have not been met with this output (information is incomplete or incorrect)</label>
    </div>
  </fieldset>
</p>
`;

    recordResults += `<table id="cmd-${c}" class="record-results">
<tr>
  <th>Assertion</th>
  <th>
    Correct Output
  </th>
  <th>
    No Output
  </th>
  <th>
    Incorrect Output
  </th>
  <th id="testernotes-${c}">Additional tester notes</th>
</tr>
`;

    for (let a = 0; a < assertions.length; a++) {
      recordResults += `
<tr>
  <td class="assertion-${c}-${a}"><div>${assertions[a]}</div><div class="required">(required: select output)</div></td>
  <td>
      <input type="radio" id="correct-${c}-${a}" class="correct" name="result-${c}-${a}">
      <label for="correct-${c}-${a}">Correct Output</label>
  </td>
  <td>
      <input type="radio" id="missing-${c}-${a}" class="missing" name="result-${c}-${a}">
      <label for="missing-${c}-${a}">No Output</label>
  </td>
  <td>
      <input type="radio" id="incorrect-${c}-${a}" class="incorrect" name="result-${c}-${a}">
      <label for="incorrect-${c}-${a}">Incorrect Output</label>
  </td>
  <td>
    <input aria-labelledBy="testernotes-${c}" type="text" id="info-${c}-${a}">
  </td>
</tr>
`;
    }

    recordResults += '</table>';
  }

  let recordEl = document.getElementById('record-results');
  recordEl.innerHTML = recordResults;

  let radios = document.querySelectorAll('input[type="radio"]');
  for (let radio of radios) {
    radio.onclick = handleRadioClick;
  }

  // Submit button
  let el = document.createElement('button');
  el.innerText = "Submit";
  el.value = behaviorId;
  el.addEventListener('click', submitResult);
  recordEl.append(el);

  document.querySelector('#behavior-header').focus();
}


function handleRadioClick(event) {
  let radioId = event.target.id;
  let cmdId = Number(radioId.split('-')[1]);

  if (radioId.indexOf('allcorrect') === 0) {
    for (let resultType of ['correct', 'incomplete', 'incorrect']) {
      let radios = document.querySelectorAll(`#cmd-${cmdId} .${resultType}`);
      let checked = resultType === 'correct' ? true : false;
      for (let radio of radios) {
	radio.checked = checked;
      }
    }
  }

  else {
    let markedAs = radioId.split('-')[0];
    if (markedAs === 'correct') {
      let markedCorrect = document.querySelectorAll(`#cmd-${cmdId} .correct:checked`);
      if (markedCorrect.length === allBehaviors[currentTestedBehavior].assertions.length) {
	let allradio = document.querySelector(`#cmd-${cmdId}-summary #allcorrect-${cmdId}`);
	allradio.checked = true;
      }
    }
    else {
      let allradio = document.querySelector(`#cmd-${cmdId}-summary #allincomplete-${cmdId}`);
      allradio.checked = true;
    }
  }
}

function validateResults() {

  let focusEl;
  for (let c = 0; c < allBehaviors[currentTestedBehavior].commands.length; c++) {

    let fieldset = document.getElementById(`cmd-${c}-summary`);
    let cmdInput = fieldset.querySelector('input[type="text"]');
    if (!cmdInput.value) {
      focusEl = focusEl || cmdInput;
      fieldset.classList.add('highlight-required');
      fieldset.querySelector('.required').classList.add('highlight-required');
    } else {
      fieldset.classList.remove('highlight-required');
      fieldset.querySelector('.required').classList.remove('highlight-required');
    }

    let allSelected = fieldset.querySelector(`input[name="allresults-${c}"]:checked`);
    if (!allSelected) {
      focusEl = focusEl || document.getElementById(`allcorrect-${c}`);
      fieldset.classList.add('highlight-required');
    }

    if (
      fieldset.querySelector('.allcorrect').checked
      || !allSelected
    ) {
      for (let a = 0; a < allBehaviors[currentTestedBehavior].assertions.length; a++) {
	document.querySelector(`.assertion-${c}-${a} .required`).classList.remove('highlight-required');
      }
      continue;
    }

    for (let a = 0; a < allBehaviors[currentTestedBehavior].assertions.length; a++) {
      let selectedRadio = document.querySelector(`input[name="result-${c}-${a}"]:checked`);
      if (!selectedRadio) {
	document.querySelector(`.assertion-${c}-${a} .required`).classList.add('highlight-required');
	focusEl = focusEl || document.getElementById(`correct-${c}-${a}`);
      }
      else {
	document.querySelector(`.assertion-${c}-${a} .required`).classList.remove('highlight-required');
      }
    }
  }

  if (focusEl) {
    focusEl.focus();
    return false;
  }
  return true;
}

function submitResult(event) {
  if (!validateResults()) {
    return;
  }

  let cmdOutput = {};
  for (let c = 0; c < allBehaviors[currentTestedBehavior].commands.length; c++) {
    cmdOutput[allBehaviors[currentTestedBehavior].commands[c]] = document.querySelector(`#speechoutput-${c}`).value;
  }

  let assertionResults = [];
  for (let a = 0; a < allBehaviors[currentTestedBehavior].assertions.length; a++) {
    assertionResults.push({correct: [], incorrect: [], incomplete: []});
  }

  for (let c = 0; c < allBehaviors[currentTestedBehavior].commands.length; c++) {
    let failures = document.querySelectorAll(`#cmd-${c} .incorrect:checked`);
    for (let failure of failures) {
      let assertionId = Number(failure.id.split('-')[2]);
      assertionResults[assertionId].incorrect.push({
	cmd: allBehaviors[currentTestedBehavior].commands[c],
	otherInfo: document.querySelector(`#cmd-${c} #info-${c}-${assertionId}`).value
      });
    }

    let successes = document.querySelectorAll(`#cmd-${c} .correct:checked`);
    for (let success of successes) {
      let assertionId = Number(success.id.split('-')[2]);
      assertionResults[assertionId].correct.push({
	cmd: allBehaviors[currentTestedBehavior].commands[c],
	otherInfo: document.querySelector(`#cmd-${c} #info-${c}-${assertionId}`).value
      });
    }

    let incompletes = document.querySelectorAll(`#cmd-${c} .incomplete:checked`);
    for (let incomplete of incompletes) {
      let assertionId = Number(incomplete.id.split('-')[2]);
      assertionResults[assertionId].incomplete.push({
	cmd: allBehaviors[currentTestedBehavior].commands[c],
	otherInfo: document.querySelector(`#cmd-${c} #info-${c}-${assertionId}`).value
      });
    }
  }

  let behaviorResults = [];
  let overallBehaviorResult = 'PASS';
  for (let a = 0; a < assertionResults.length; a++) {
    let assertionResult = assertionResults[a];
    let assertionName = allBehaviors[currentTestedBehavior].assertions[a];

    // The status is fail if anything fails, or incomplete if nothing fails but somethings are incomplete
    let status = assertionResult.incomplete.length === 0 ? 'PASS' : 'INCOMPLETE';
    status = assertionResult.incorrect.length === 0 ? status : 'FAIL';

    behaviorResults.push({
      name: assertionName,
      status: status,
      details: assertionResult
    });

    if (status === 'FAIL') {
      overallBehaviorResult = 'FAIL';
    }
    else if (status === 'INCOMPLETE' && overallBehaviorResult === 'PASS') {
      overallBehaviorResult = 'INCOMPLETE';
    }
  }

  allBehaviorResults.push({
    status: overallBehaviorResult,
    assertionResults: behaviorResults,
    task: allBehaviors[currentTestedBehavior].specific_user_instruction,
    mode: allBehaviors[currentTestedBehavior].mode,
    speechOutputForCommand: cmdOutput
  });

  // Display the next behavior
  if (currentTestedBehavior < allBehaviors.length - 1) {
    currentTestedBehavior++;
    displayInstructionsForBehaviorTest(currentTestedBehavior);
  }
  else {
    endTest();
  }
}

function endTest() {
  let resulthtml = `<h1>${document.title}</h1><h2 id=overallstatus></h2>`;

  let status = 'PASS';
  for (let result of allBehaviorResults) {

    if (result.status === 'FAIL') {
      status = 'FAIL';
    }
    else if (result.status === 'INCOMPLETE' && status === 'PASS') {
      status = 'INCOMPLETE';
    }

    resulthtml += `<p>After user performs task "${result.task}" in ${result.mode} mode, the following behavior was observed:<p>`;
    resulthtml += `<table>`;
    for (let assertionResult of result.assertionResults) {
      resulthtml += `<tr><td>${assertionResult.status}</td><td>${assertionResult.name}</td>`

      let failingCmds = assertionResult.details.incorrect.map((f) => f.cmd);
      let passingCmds = assertionResult.details.correct.map((p) => p.cmd);
      let incompleteCmds = assertionResult.details.incomplete.map((p) => p.cmd);

      resulthtml += '<td><ul>'
      if (passingCmds.length) {
	resulthtml += `<li>Passed for commands: ${passingCmds.join(', ')}.</li>`;
      }
      if (failingCmds.length) {
	resulthtml += `<li>Incorrect information supplied after commands: ${failingCmds.join(', ')}.</li>`;
      }
      if (incompleteCmds.length) {
	resulthtml += `<li>Incomplete or no information supplied for commands: ${incompleteCmds.join(', ')}.</li>`;
      }
      resulthtml += '</ul></td>'
      resulthtml += '</tr>'
    }
    resulthtml += `</table>`;
  }

  document.body.innerHTML = resulthtml;
  document.querySelector('#overallstatus').innerHTML = `Test result: ${status}`;

  reportResults(allBehaviorResults, status);

  if (typeof testPageWindow !== 'undefined') {
    testPageWindow.close();
  }
}


function showUserError() {
  if (errors.length) {
    document.getElementById('errors').style.display = "block";
    let errorListEl = document.querySelector('#errors ul');
    for (let error of errors) {
      let errorMsgEl = document.createElement('li');
      errorMsgEl.innerText = error;
      errorListEl.append(errorMsgEl);
    }
  }
}

function reportResults(testResults, status) {
  var results_element = document.createElement("script");
  results_element.type = "text/json";
  results_element.id = "__ariaatharness__results__";
  var data = {
    test: document.title,
    tests: testResults,
    status: status
  };
  results_element.textContent = JSON.stringify(data);

  document.body.appendChild(results_element);
}
