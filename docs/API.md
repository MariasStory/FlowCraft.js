```markdown
# FlowCraft.js API Reference

This document provides a detailed reference for the FlowCraft.js API.

## Table of Contents

*   [Core `FlowCraft` Object](#core-flowcraft-object)
    *   [`FlowCraft.define()`](#flowcraftdefineflowname-tasks-options)
    *   [`FlowCraft.run()`](#flowcraftrunflowname-initialcontext)
*   [`FlowInstance` (Controller)](#flowinstance-controller)
    *   [`instance.result`](#instanceresult)
    *   [`instance.pause()`](#instancepause)
    *   [`instance.resume()`](#instanceresumeresumedata)
    *   [`instance.abort()`](#instanceabortreason)
    *   [`instance.getState()`](#instancegetstate)
*   [Task Definition](#task-definition)
    *   [Function Shortcut](#function-shortcut)
    *   [Object Definition](#object-definition)
*   [Task Function Signature](#task-function-signature)
*   [Options](#options)
    *   [Flow Options (for `define`)](#flow-options-for-define)
    *   [Task Options (in Task Definition)](#task-options-in-task-definition)
*   [Constants](#constants)
    *   [`FlowCraft.STATUS`](#flowcraftstatus)
    *   [`FlowCraft.LOG_LEVEL`](#flowcraftlog_level)
    *   [`FlowCraft.SIGNAL_TYPE`](#flowcraftsignal_type)
    *   [`FlowCraft.ERROR_ACTION`](#flowcrafterror_action)

---

## Core `FlowCraft` Object

The main entry point for the library. Available as the default export when using modules, or as a global `FlowCraft` variable when using a script tag.

**Properties:**

*   `version` (String): The current version of the library.
*   `STATUS` (Object): See [Constants - STATUS](#flowcraftstatus).
*   `LOG_LEVEL` (Object): See [Constants - LOG_LEVEL](#flowcraftlog_level).
*   `SIGNAL_TYPE` (Object): See [Constants - SIGNAL_TYPE](#flowcraftsignal_type).
*   `ERROR_ACTION` (Object): See [Constants - ERROR_ACTION](#flowcrafterror_action).

**Methods:**

*   `define(flowName, tasks, options)`
*   `run(flowName, initialContext)`

---

### `FlowCraft.define(flowName, tasks, options)`

Defines a reusable blueprint for a task flow.

*   **`flowName`** (String): A unique name to identify this flow definition.
*   **`tasks`** (Array<`Object`|`Function`>): An ordered array defining the tasks in the flow. See [Task Definition](#task-definition).
*   **`options`** (Object, *optional*): Configuration options applied to the entire flow. See [Flow Options](#flow-options-for-define).

**Returns:** `undefined`

**Example:**

```javascript
FlowCraft.define(
  'userDataProcessing',
  [
    fetchUserDataTask, // Task defined as a function
    { // Task defined as an object
      id: 'process_step',
      func: processUserDataTask,
      options: { maxRetries: 1 }
    }
  ],
  {
    logLevel: FlowCraft.LOG_LEVEL.INFO,
    defaultMaxRetries: 0
  }
);
```

---

### `FlowCraft.run(flowName, initialContext)`

Executes a previously defined flow, creating a new instance of it.

*   **`flowName`** (String): The name of the flow (as defined using `FlowCraft.define`).
*   **`initialContext`** (Object, *optional*, Default: `{}`): An object containing initial data. This object will be passed as the `context` to the first task and can be modified by subsequent tasks.

**Returns:** [`FlowInstance`](#flowinstance-controller): A controller object for interacting with this specific execution of the flow.

**Example:**

```javascript
const instance = FlowCraft.run('userDataProcessing', { userId: 123 });

instance.result.then(finalContext => {
  console.log('Flow completed!', finalContext);
}).catch(error => {
  console.error('Flow failed:', error);
});
```

---

## `FlowInstance` (Controller)

An object returned by `FlowCraft.run()` that allows you to interact with and monitor a specific, running flow instance.

---

### `instance.result`

*   **Type:** `Promise`
*   **Description:** A promise that resolves when the flow completes successfully or rejects if the flow encounters an unhandled error or is aborted.
    *   **Resolves with:** The final state of the `context` object after the last task has successfully executed.
    *   **Rejects with:** The `Error` object that caused the failure or an `Error` indicating the reason for abortion.

---

### `instance.pause()`

Requests the flow to pause *after* the currently executing task completes. If the flow is already paused or not running, this method logs a warning and has no effect.

*   **Returns:** `undefined`

---

### `instance.resume(resumeData)`

Resumes a flow that is currently in the `PAUSED` state.

*   **`resumeData`** (Object, *optional*, Default: `null`): If provided, the properties of this object are shallow-merged into the flow's `context` before execution continues. This allows passing data back into the flow after a pause (e.g., user input).
*   **Returns:** `undefined`
*   **Note:** If the flow is not paused, this method logs a warning and has no effect.

---

### `instance.abort(reason)`

Immediately stops the execution of the flow and sets its status to `ABORTED`.

*   **`reason`** (String, *optional*, Default: `'Manual abort'`): A description of why the flow was aborted. This reason will be included in the error message that rejects the `instance.result` promise.
*   **Returns:** `undefined`
*   **Note:** If the flow is already completed, aborted, or has errored, this method logs a warning and has no effect.

---

### `instance.getState()`

Returns a snapshot of the current state of the flow instance.

*   **Returns:** `Object` - A plain object containing the following properties:
    *   `flowName` (String): The name of the flow definition.
    *   `status` (String): The current execution status (e.g., `FlowCraft.STATUS.RUNNING`, `FlowCraft.STATUS.PAUSED`). See [Constants - STATUS](#flowcraftstatus).
    *   `currentTaskIndex` (Number): The index of the task that is currently executing or about to execute.
    *   `context` (Object): A shallow copy of the current shared context object.
    *   `lastError` (Error | null): The last error encountered, if any.
    *   `signalData` (any | null): Data passed along with the last signal (e.g., data provided when signaling `PAUSE`).

---

## Task Definition

Tasks are the individual steps within a flow. They are defined in the `tasks` array passed to `FlowCraft.define()`. Each element in the array can be either a direct function reference or a configuration object.

---

### Function Shortcut

The simplest way to define a task is to provide the task function directly.

*   **Type:** `Function`
*   **Description:** The function conforming to the [Task Function Signature](#task-function-signature).
*   **Example:** `[fetchData, processData]`

---

### Object Definition

For more control (setting IDs, task-specific options, or error handlers), define a task using an object with the following properties:

*   **`func`** (Function, **required**): The function to execute for this task. Must conform to the [Task Function Signature](#task-function-signature).
*   **`id`** (String, *optional*): A unique identifier for this task within the flow. Useful for logging and error handling identification. Defaults to `task_<index>`.
*   **`options`** (Object, *optional*): Task-specific options that override flow-level options. See [Task Options](#task-options-in-task-definition).
*   **`onError`** (Function, *optional*): A task-specific error handler function.
    *   **Signature:** `async (error, context, taskInfo) => result`
    *   **Parameters:**
        *   `error` (Error): The error thrown by the task's `func`.
        *   `context` (Object): The current flow context.
        *   `taskInfo` (Object): Information about the task (`{ id, index, retries, maxRetries }`).
    *   **Return Value:** Should return one of the `FlowCraft.ERROR_ACTION` constants (`RETRY`, `SKIP`, `ABORT`) or a fallback value to proceed with (effectively skipping the failed task but potentially altering context). If the handler throws an error or returns an invalid value, the flow defaults to `ABORT`.
    *   **Note:** If defined, this handler takes precedence over the flow-level `onError` handler for errors originating from this specific task.

**Example:**

```javascript
{
  id: 'fetch_user_profile',
  func: fetchUserProfile,
  options: {
    maxRetries: 3,
    yieldAfter: true
  },
  onError: async (err, ctx, info) => {
    console.error(`Task ${info.id} failed! Attempt ${info.retries + 1}`, err);
    if (info.retries < info.maxRetries) {
      return FlowCraft.ERROR_ACTION.RETRY;
    }
    ctx.profileFetchFailed = true; // Mark context
    return FlowCraft.ERROR_ACTION.SKIP; // Skip after max retries
  }
}
```

---

## Task Function Signature

This defines the signature for the actual functions you write to perform work within a flow.

`async (context, api) => result`

*   **`context`** (Object): The shared context object for the flow. Tasks can read from and write to this object to pass data along the flow. Modifications are persistent for subsequent tasks in the same flow instance.
*   **`api`** (Object): An object provided by the FlowCraft framework containing helpers:
    *   **`signal(type, data)`** (Function): Allows the task to send a signal back to the flow runner.
        *   `type` (Constant): The type of signal (e.g., `FlowCraft.SIGNAL_TYPE.PAUSE`).
        *   `data` (any, *optional*): Optional data payload associated with the signal.
    *   **`taskInfo`** (Object): Contains metadata about the current task execution:
        *   `id` (String): The task's identifier.
        *   `index` (Number): The task's zero-based index in the flow definition.
        *   `retries` (Number): The number of times this specific task instance has been retried due to errors within the current `run`.
        *   `maxRetries` (Number): The maximum number of retries configured for this task.
*   **Return Value** (any | `FlowCraft.SIGNAL_TYPE.PAUSE`):
    *   Most return values are currently ignored by the framework (though they might be logged). State changes should primarily occur by modifying the `context` object.
    *   **Exception:** Returning `FlowCraft.SIGNAL_TYPE.PAUSE` (or calling `signal(FlowCraft.SIGNAL_TYPE.PAUSE)`) will pause the flow after the task completes.

**Example Task Function:**

```javascript
async function fetchSomeData(context, { signal, taskInfo }) {
  console.log(`Running task ${taskInfo.id} (Attempt ${taskInfo.retries + 1})`);
  try {
    const response = await fetch(`/api/data/${context.itemId}`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    context.itemData = await response.json(); // Modify context
    console.log('Data fetched successfully');
    // No explicit return needed unless signaling
  } catch (error) {
    console.error('Failed to fetch data:', error);
    // Let the error propagate to be handled by onError handlers
    throw error;
  }
}
```

---

## Options

Configuration options can be set at the flow level (in `FlowCraft.define`) and/or overridden at the task level (in the task definition object).

---

### Flow Options (for `define`)

These options are passed as the third argument to `FlowCraft.define()`.

*   **`logLevel`** (Number, *optional*, Default: `FlowCraft.LOG_LEVEL.INFO`): The minimum level of messages to log. See [Constants - LOG_LEVEL](#flowcraftlog_level).
*   **`logger`** (Object, *optional*, Default: Internal console logger): An object with methods `{ error, warn, info, debug }` for handling log messages. Allows integration with custom logging libraries.
*   **`onError`** (Function, *optional*): A global error handler for the flow. It's called if a task throws an error *and* that task does not have its own `onError` handler, or if the task-specific handler doesn't resolve the error (e.g., by returning `RETRY` or `SKIP`).
    *   **Signature:** `async (error, context, taskInfo) => result` (Same as task-level `onError`).
    *   **Return Value:** `FlowCraft.ERROR_ACTION` constant or a fallback value. If not provided or doesn't handle the error, the flow defaults to `ABORT`.
*   **`yieldBeforeTask`** (Boolean, *optional*, Default: `false`): If `true`, FlowCraft will `await` a `setTimeout(0)` before executing *each* task, yielding control to the browser's event loop. Useful for preventing UI freezes during long sequences of *synchronous* tasks.
*   **`yieldAfterTask`** (Boolean, *optional*, Default: `false`): If `true`, FlowCraft will `await` a `setTimeout(0)` after executing *each* task.
*   **`defaultMaxRetries`** (Number, *optional*, Default: `0`): The default number of retry attempts for tasks if an `onError` handler returns `FlowCraft.ERROR_ACTION.RETRY` and the task doesn't have its own `maxRetries` option.

---

### Task Options (in Task Definition)

These options are provided within the `options` property of a [Task Object Definition](#object-definition). They override the flow-level options for that specific task.

*   **`yieldBefore`** (Boolean, *optional*, Default: Inherits from `options.yieldBeforeTask`): If `true`, yields before this specific task.
*   **`yieldAfter`** (Boolean, *optional*, Default: Inherits from `options.yieldAfterTask`): If `true`, yields after this specific task.
*   **`maxRetries`** (Number, *optional*, Default: Inherits from `options.defaultMaxRetries`): The maximum number of retry attempts specifically for this task when `ERROR_ACTION.RETRY` is returned by an error handler.

---

## Constants

Constants are available as properties on the main `FlowCraft` object (e.g., `FlowCraft.STATUS.RUNNING`).

---

### `FlowCraft.STATUS`

Represents the possible execution states of a flow instance.

*   `IDLE`: Initial state before `run()` is called internally.
*   `RUNNING`: The flow is actively executing tasks.
*   `PAUSED`: The flow execution is paused (e.g., waiting for `resume()`).
*   `COMPLETED`: The flow finished all tasks successfully.
*   `ABORTED`: The flow was stopped prematurely via `instance.abort()`.
*   `ERROR`: The flow stopped due to an unhandled error.

---

### `FlowCraft.LOG_LEVEL`

Used to control logging verbosity. Higher numbers include logs from lower numbers.

*   `NONE` (0): No logs.
*   `ERROR` (1): Only logs errors.
*   `INFO` (2): Logs errors, warnings, and informational messages (flow start/end, task start/end, signals).
*   `DEBUG` (3): Logs everything from `INFO` plus debug messages (context states, yielding, handler calls).

---

### `FlowCraft.SIGNAL_TYPE`

Used by tasks to signal the flow runner via the `signal()` function.

*   `PAUSE`: Signals the flow runner to pause execution after the current task completes.

*(This can potentially be extended with more signal types in future versions).*

---

### `FlowCraft.ERROR_ACTION`

Return values for `onError` handlers to instruct the flow runner how to proceed after a task error.

*   `ABORT`: Stop the flow immediately and set status to `ERROR`.
*   `SKIP`: Ignore the error for this task, reset its retry count, and proceed to the next task.
*   `RETRY`: Attempt to execute the same failed task again (respecting `maxRetries`).

*(If an `onError` handler returns any other value, it's treated as a fallback value; the error is considered handled, the task's retry count is reset, and the flow proceeds to the next task).*