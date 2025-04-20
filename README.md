# FlowCraft.js ✨

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![issues](https://img.shields.io/github/issues/MariasStory/FlowCraft.js.svg)](https://github.com/MariasStory/FlowCraft.js/issues) <!-- Update link -->
[![pull requests](https://img.shields.io/github/issues-pr/MariasStory/FlowCraft.js.svg)](https://github.com/MariasStory/FlowCraft.js/pulls) <!-- Update link -->

**Tame complex browser workflows!** FlowCraft.js is a lightweight, zero-dependency JavaScript library for defining, executing, and monitoring sequences of tasks (functions) directly in the browser. Bring structure, observability, and robust error handling to your client-side processes like multi-step forms, API call chains, data processing pipelines, and interactive onboarding flows.

Stop wrestling with deeply nested `async/await` chains or complex state management for simple sequential logic. FlowCraft provides a clear, declarative API to orchestrate your browser tasks.

---

## 🚀 Key Features

*   **Declarative Flow Definition:** Define task sequences clearly using simple JavaScript arrays and objects.
*   **Native `async/await` Support:** Seamlessly integrate synchronous and asynchronous tasks.
*   **Robust Error Handling:** Implement task-specific or flow-level error handlers with `RETRY`, `SKIP`, or `ABORT` strategies. Define maximum retry counts.
*   **Task Signaling:** Allow tasks to communicate back to the flow runner, enabling features like `PAUSE` for user input and `RESUME`.
*   **Shared Context:** Easily pass data between tasks in a flow using a shared context object.
*   **Configurable Logging:** Detailed, leveled logging (`DEBUG`, `INFO`, `WARN`, `ERROR`) or integrate your own custom logger for perfect observability.
*   **Flow Control:** Get a `FlowInstance` controller to externally `pause()`, `resume()`, `abort()`, or `getState()` of running flows.
*   **Yielding Mechanism:** Optional yielding between tasks (`yieldBeforeTask`, `yieldAfterTask`) to prevent blocking the main thread during sequences of synchronous operations.
*   **Zero Dependencies:** Lightweight and dependency-free.
*   **MIT Licensed:** Free to use and modify.

## 🤔 Why FlowCraft.js?

Modern web apps often involve complex client-side interactions. While `Promise` and `async/await` are great, managing longer sequences with branching logic, error recovery, and necessary pauses can quickly lead to tangled code that's hard to read, debug, and maintain.

FlowCraft.js provides a dedicated layer for this orchestration, keeping your flow logic separate from your task implementation.

*   **Readability:** See your entire workflow structure at a glance.
*   **Maintainability:** Modify, add, or remove steps without unraveling complex chains.
*   **Debuggability:** Pinpoint issues faster with built-in logging and clear error handling.
*   **Control:** Gain explicit control over flow execution, perfect for interactive scenarios.

It aims for a sweet spot – more structured than raw `async/await`, but less opinionated and potentially lighter than full state machines (like XState) or reactive stream libraries (like RxJS) when your primary need is sequential task management with good control and logging.

## 🛠️ Installation

**NPM / Yarn:**

```bash
npm install flowcraft-js # Or yarn add flowcraft-js
```

```javascript
// ES Modules
import FlowCraft from 'flowcraft-js';
// CommonJS
const FlowCraft = require('flowcraft-js');
```

**CDN / Browser:**

```html
<script src="https://cdn.jsdelivr.net/npm/flowcraft-js@latest/dist/flowcraft.min.js"></script> <!-- Get specific version if needed -->
<!-- FlowCraft is available as a global variable -->
<script>
  console.log(FlowCraft.version);
</script>
```

*(Note: You might need to adjust the CDN link/npm package name based on your final published package details. The provided `flowcraft.js` code needs a build step to create a distributable version for CDN/npm, e.g., using Rollup or Webpack).*

**Direct Download:**

Download `flowcraft.js` (or a minified version) from the `dist` folder (once created) of this repository and include it in your HTML.

## ⚡ Quick Start

```javascript
import FlowCraft from 'flowcraft-js'; // Or use the global FlowCraft in browser

// --- 1. Define Tasks ---
// Async task
async function fetchData(context) {
  console.log('Fetching data...');
  await new Promise(res => setTimeout(res, 500)); // Simulate network request
  context.data = { id: 1, name: 'Example Data' };
  console.log('Data fetched:', context.data);
}

// Sync task
function processData(context) {
  console.log('Processing data...');
  if (!context.data) throw new Error('Data is missing!');
  context.processed = `Processed: ${context.data.name.toUpperCase()}`;
  console.log('Data processed:', context.processed);
}

// --- 2. Define the Flow ---
FlowCraft.define('MyFirstFlow', [
    fetchData, // Simple function task
    {
        id: 'processing_step', // Optional task ID
        func: processData,
        options: { yieldBefore: true } // Optional: Yield before this sync task
    }
], {
    logLevel: FlowCraft.LOG_LEVEL.INFO // Set log level
});

// --- 3. Run the Flow ---
console.log('Starting flow...');
const flowInstance = FlowCraft.run('MyFirstFlow', { initialValue: 'start' });

// --- 4. Handle Completion/Error ---
flowInstance.result
    .then(finalContext => {
        console.log('✅ Flow Completed Successfully! Final Context:', finalContext);
    })
    .catch(error => {
        console.error('❌ Flow Failed:', error);
        const state = flowInstance.getState(); // Get state even on failure
        console.error('State at failure:', state);
    });

// --- 5. (Optional) Interact with the Flow ---
// setTimeout(() => {
//   console.log('Attempting to abort flow...');
//   flowInstance.abort('Timeout reached');
// }, 300);
```

## ✨ Advanced Usage

### Error Handling (Retry/Skip)

```javascript
FlowCraft.define('ResilientFlow', [
  async (context) => { /* ... */ },
  {
    id: 'maybeFailTask',
    func: async (context, { taskInfo }) => {
      console.log(`Attempting task (try ${taskInfo.retries + 1}/${taskInfo.maxRetries + 1})`);
      await new Promise(res => setTimeout(res, 200));
      if (Math.random() > 0.5) {
        throw new Error('Random network blip!');
      }
      context.result = 'Success!';
      console.log('Task succeeded!');
    },
    options: { maxRetries: 2 } // Task-specific retry override
  },
  (context) => { console.log('Final Step. Result:', context.result || 'Task Skipped/Failed'); }
], {
  logLevel: FlowCraft.LOG_LEVEL.DEBUG,
  // Flow-level error handler
  onError: async (error, context, taskInfo) => {
    console.warn(`HANDLING ERROR in '${taskInfo.id}': ${error.message}`);
    if (taskInfo.id === 'maybeFailTask' && taskInfo.retries < taskInfo.maxRetries) {
      console.warn(`-> Retrying '${taskInfo.id}'...`);
      await new Promise(res => setTimeout(res, 500)); // Optional delay before retry
      return FlowCraft.ERROR_ACTION.RETRY; // Signal framework to retry
    } else if (taskInfo.id === 'maybeFailTask') {
       console.warn(`-> Max retries reached for '${taskInfo.id}'. Skipping.`);
       context.wasSkipped = true;
       return FlowCraft.ERROR_ACTION.SKIP; // Signal framework to skip
    }
    console.error(`-> Unrecoverable error in '${taskInfo.id}'. Aborting.`);
    return FlowCraft.ERROR_ACTION.ABORT; // Default if not handled
  }
});

FlowCraft.run('ResilientFlow');
```

### Signaling (Pause/Resume)

```javascript
// Task that needs external input
async function waitForInput(context, { signal }) {
  console.log('Task: Waiting for user input...');
  context.promptMessage = "Please enter your name:";
  // Signal the flow to pause AFTER this task completes
  signal(FlowCraft.SIGNAL_TYPE.PAUSE, { reason: "Awaiting input" });
  console.log('Task: Signaled PAUSE.');
  // The flow pauses here, waiting for resume()
}

function useInput(context) {
  console.log('Task: Resumed!');
  if (context.userName) {
    console.log(`Task: Hello, ${context.userName}!`);
    context.greeting = `Hello, ${context.userName}!`;
  } else {
    console.log('Task: User did not provide a name.');
    context.greeting = "Hello, anonymous user!";
  }
}

FlowCraft.define('InteractiveFlow', [waitForInput, useInput]);

const interactiveInstance = FlowCraft.run('InteractiveFlow');

interactiveInstance.result.then(ctx => {
  console.log('Interactive flow finished. Greeting:', ctx.greeting);
}).catch(err => {
  console.error('Interactive flow failed:', err);
});

// Simulate waiting for the flow to pause, then resuming it
setTimeout(() => {
  const state = interactiveInstance.getState();
  if (state.status === FlowCraft.STATUS.PAUSED) {
    console.log("UI: Flow is paused. Prompting user...");
    // In a real app, show UI based on state.signalData and state.context.promptMessage
    const name = prompt(state.context.promptMessage || "Enter name:");
    console.log(`UI: Resuming flow with name: ${name || 'N/A'}`);
    // Pass data back via resume() - it gets merged into the context
    interactiveInstance.resume({ userName: name || null });
  }
}, 1000); // Adjust timing based on task duration
```

### Custom Logging

```javascript
const myLogger = {
    error: (...args) => console.error('[MyErrorLogger]', ...args),
    warn: (...args) => console.warn('[MyWarnLogger]', ...args),
    info: (...args) => console.log('[MyInfoLogger]', ...args),
    debug: (...args) => console.debug('[MyDebugLogger]', ...args), // Use console.debug or console.log
};

FlowCraft.define('CustomLogFlow', [/* tasks */], {
    logger: myLogger,
    logLevel: FlowCraft.LOG_LEVEL.DEBUG
});

FlowCraft.run('CustomLogFlow');
```

## API Reference

*(For detailed API reference, please see `docs/API.md`)* <!-- Create this file! -->

### Core Methods

*   `FlowCraft.define(flowName, tasks, options)`: Defines a new flow.
*   `FlowCraft.run(flowName, initialContext)`: Starts a flow instance. Returns a `FlowInstance`.

### FlowInstance (Controller)

Returned by `FlowCraft.run()`.

*   `instance.result`: Promise that resolves with the final context on completion or rejects on error/abort.
*   `instance.pause()`: Requests the flow to pause after the current task finishes.
*   `instance.resume(resumeData)`: Resumes a paused flow. Optional `resumeData` object is merged into the context.
*   `instance.abort(reason)`: Immediately aborts the flow. Rejects the `result` promise.
*   `instance.getState()`: Returns an object with the current state (`status`, `currentTaskIndex`, `context`, `lastError`, `signalData`, etc.).

### Task Function Signature

`async (context, { signal, taskInfo }) => result | SIGNAL_TYPE.PAUSE`

*   `context`: Shared object passed between tasks. Modify it directly.
*   `signal(type, data)`: Function to signal the framework (e.g., `signal(FlowCraft.SIGNAL_TYPE.PAUSE)`).
*   `taskInfo`: Object containing `{ id, index, retries, maxRetries }`.

### Key Constants

Accessible via `FlowCraft.*`:

*   `FlowCraft.STATUS`: `IDLE`, `RUNNING`, `PAUSED`, `COMPLETED`, `ABORTED`, `ERROR`
*   `FlowCraft.LOG_LEVEL`: `NONE`, `ERROR`, `INFO`, `DEBUG`
*   `FlowCraft.SIGNAL_TYPE`: `PAUSE` (extendable)
*   `FlowCraft.ERROR_ACTION`: `ABORT`, `SKIP`, `RETRY`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1.  **Fork** the repository.
2.  Create your feature branch (`git checkout -b feature/my-new-feature`).
3.  **Commit** your changes (`git commit -am 'Add some feature'`).
4.  **Push** to the branch (`git push origin feature/my-new-feature`).
5.  Create a new **Pull Request**.

Before submitting a PR, please ensure your code adheres to the existing style and that tests (if applicable) pass.

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

Made with ❤️ and JavaScript