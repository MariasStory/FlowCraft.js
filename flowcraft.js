/**
 * FlowCraft.js: A browser-based library for managing task execution flows.
 *
 * Features:
 * - Defines and executes sequences of tasks (functions).
 * - Supports synchronous and asynchronous tasks (using async/await).
 * - Shared context for passing data between tasks.
 * - Configurable, leveled logging (none, error, info, debug) or custom logger.
 * - Layered error handling (task-level and flow-level) with RETRY, SKIP, ABORT actions.
 * - Tasks can send signals (e.g., PAUSE) to the framework.
 * - Flow controller for external interaction (pause, resume, abort, getState).
 * - Optional yielding between tasks to mitigate main thread blocking for sync sequences.
 */
(function (global) {
    'use strict';

    // --- Constants ---
    const VERSION = '1.0.0';

    const STATUS = {
        IDLE: 'idle',
        RUNNING: 'running',
        PAUSED: 'paused',
        COMPLETED: 'completed',
        ABORTED: 'aborted',
        ERROR: 'error',
    };

    const LOG_LEVEL = {
        NONE: 0,
        ERROR: 1,
        INFO: 2,
        DEBUG: 3,
    };

    const SIGNAL_TYPE = {
        PAUSE: 'FLOWCRAFT_PAUSE',
        // Add more signal types here if needed
    };

    const ERROR_ACTION = {
        ABORT: 'FLOWCRAFT_ABORT',
        SKIP: 'FLOWCRAFT_SKIP',
        RETRY: 'FLOWCRAFT_RETRY',
    };

    // --- Helper Functions ---
    function yieldToMain() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    function defaultLogger() {
        const log = (level, ...args) => console[level](...args);
        return {
            error: (...args) => log('error', ...args),
            warn: (...args) => log('warn', ...args),
            info: (...args) => log('info', ...args),
            debug: (...args) => log('debug', ...args),
        };
    }

    // --- FlowInstance Class (Controller for a running flow) ---
    class FlowInstance {
        constructor(flowCraft, flowName, executionContext) {
            this._flowCraft = flowCraft;
            this._flowName = flowName;
            this._executionContext = executionContext; // Reference to the runner's state
            this._promise = new Promise((resolve, reject) => {
                this._resolvePromise = resolve;
                this._rejectPromise = reject;
            });
        }

        /** The promise resolves/rejects when the flow completes, aborts, or errors definitively. */
        get result() {
            return this._promise;
        }

        /** Get the current state of the flow instance. */
        getState() {
            // Return a copy to prevent external mutation of internal state
            return {
                flowName: this._flowName,
                status: this._executionContext.status,
                currentTaskIndex: this._executionContext.currentTaskIndex,
                context: { ...this._executionContext.context }, // Shallow copy
                lastError: this._executionContext.lastError,
                signalData: this._executionContext.signalData
            };
        }

        /** Request the flow to pause after the current task (if running). */
        pause() {
            if (this._executionContext.status === STATUS.RUNNING) {
                this._executionContext.pauseRequested = true;
                 this._flowCraft._log(this._executionContext.logLevel, this._executionContext.logger.info, `[FlowCraft] Pause requested for flow '${this._flowName}'`);
            } else {
                this._flowCraft._log(this._executionContext.logLevel, this._executionContext.logger.warn, `[FlowCraft] Cannot pause flow '${this._flowName}': not running (status: ${this._executionContext.status})`);
            }
        }

        /** Resume a paused flow. Optional data can be passed back into the context. */
        resume(resumeData = null) {
            if (this._executionContext.status !== STATUS.PAUSED) {
                 this._flowCraft._log(this._executionContext.logLevel, this._executionContext.logger.warn, `[FlowCraft] Cannot resume flow '${this._flowName}': not paused (status: ${this._executionContext.status})`);
                return;
            }

            this._flowCraft._log(this._executionContext.logLevel, this._executionContext.logger.info, `[FlowCraft] Resuming flow '${this._flowName}'...`);
            if (resumeData !== null && typeof resumeData === 'object') {
                // Merge resumeData into context, potentially overwriting
                Object.assign(this._executionContext.context, resumeData);
                 this._flowCraft._log(this._executionContext.logLevel, this._executionContext.logger.debug, `[FlowCraft] Merged resume data into context for '${this._flowName}'.`);
            }
            this._executionContext.status = STATUS.RUNNING;
            this._executionContext.signalData = null; // Clear signal data
            // Re-trigger the execution loop asynchronously
            setTimeout(() => this._flowCraft._executeFlow(this._executionContext), 0);
        }

        /** Abort the flow execution immediately. */
        abort(reason = 'Manual abort') {
            if (this._executionContext.status === STATUS.RUNNING || this._executionContext.status === STATUS.PAUSED) {
                this._executionContext.status = STATUS.ABORTED;
                this._executionContext.lastError = new Error(`Flow aborted: ${reason}`);
                 this._flowCraft._log(this._executionContext.logLevel, this._executionContext.logger.warn, `[FlowCraft] Aborting flow '${this._flowName}'. Reason: ${reason}`);
                this._rejectPromise(this._executionContext.lastError); // Reject the main promise
            } else {
                this._flowCraft._log(this._executionContext.logLevel, this._executionContext.logger.warn, `[FlowCraft] Cannot abort flow '${this._flowName}': not running or paused (status: ${this._executionContext.status})`);
            }
        }
    }


    // --- FlowCraft Core Class ---
    class FlowCraft {
        constructor() {
            this.version = VERSION;
            this._flows = {}; // Store defined flows { flowName: { tasks: [], options: {} } }
            this._activeInstances = new Map(); // Track running instances { executionId: executionContext }
            this._executionCounter = 0;
        }

        _log(level, logFn, ...args) {
            if (level >= LOG_LEVEL.ERROR && (logFn === console.error || (logFn.name && logFn.name.includes('error')))) logFn(...args);
            else if (level >= LOG_LEVEL.INFO && (logFn === console.info || logFn === console.warn || (logFn.name && (logFn.name.includes('info') || logFn.name.includes('warn'))))) logFn(...args);
            else if (level >= LOG_LEVEL.DEBUG && (logFn === console.debug || (logFn.name && logFn.name.includes('debug')))) logFn(...args);
        }

        /**
         * Defines a new task flow.
         * @param {string} flowName - A unique name for the flow.
         * @param {Array<Object|Function>} tasks - An array of task definitions or functions.
         * Task definition: { id: string (optional), func: Function, onError?: Function, options?: { yieldBefore?: boolean, yieldAfter?: boolean, maxRetries?: number } }
         * Task function signature: async (context, { signal, taskInfo }) => result | SIGNAL_TYPE.PAUSE
         * @param {Object} [options={}] - Flow configuration options.
         * @param {number} [options.logLevel=LOG_LEVEL.INFO] - Logging level (NONE, ERROR, INFO, DEBUG).
         * @param {Function} [options.logger=defaultLogger()] - Custom logger object {error, warn, info, debug}.
         * @param {Function} [options.onError] - Global error handler for the flow. Signature: (error, context, taskInfo) => ERROR_ACTION | fallbackValue
         * @param {boolean} [options.yieldBeforeTask=false] - Yield to main thread before each task.
         * @param {boolean} [options.yieldAfterTask=false] - Yield to main thread after each task.
         * @param {number} [options.defaultMaxRetries=0] - Default max retries for tasks if onError returns RETRY.
         */
        define(flowName, tasks, options = {}) {
            if (this._flows[flowName]) {
                console.warn(`[FlowCraft] Warning: Redefining flow '${flowName}'.`);
            }
            if (!Array.isArray(tasks) || tasks.length === 0) {
                throw new Error(`[FlowCraft] Flow '${flowName}' must have at least one task defined.`);
            }

            const flowDefinition = {
                tasks: tasks.map((task, index) => {
                    if (typeof task === 'function') {
                        return { id: `task_${index}`, func: task, options: {}, retries: 0 };
                    }
                    if (typeof task === 'object' && typeof task.func === 'function') {
                        return {
                             id: task.id || `task_${index}`,
                             func: task.func,
                             onError: task.onError, // Task specific error handler
                             options: task.options || {},
                             retries: 0 // Initialize retry count for the task definition scope
                        };
                    }
                    throw new Error(`[FlowCraft] Invalid task definition at index ${index} for flow '${flowName}'. Must be a function or an object with a 'func' property.`);
                }),
                options: {
                    logLevel: options.logLevel !== undefined ? options.logLevel : LOG_LEVEL.INFO,
                    logger: options.logger || defaultLogger(),
                    onError: options.onError, // Flow level error handler
                    yieldBeforeTask: options.yieldBeforeTask || false,
                    yieldAfterTask: options.yieldAfterTask || false,
                    defaultMaxRetries: options.defaultMaxRetries || 0,
                    ...options // Allow other custom options
                }
            };

            this._flows[flowName] = flowDefinition;
            this._log(flowDefinition.options.logLevel, flowDefinition.options.logger.info, `[FlowCraft] Defined flow '${flowName}' with ${flowDefinition.tasks.length} tasks.`);
        }

        /**
         * Runs a defined flow.
         * @param {string} flowName - The name of the flow to run.
         * @param {Object} [initialContext={}] - An initial context object to be passed to the first task.
         * @returns {FlowInstance} - A controller object for the running flow instance.
         */
        run(flowName, initialContext = {}) {
            const flowDefinition = this._flows[flowName];
            if (!flowDefinition) {
                throw new Error(`[FlowCraft] Flow '${flowName}' is not defined.`);
            }

            this._executionCounter++;
            const executionId = `${flowName}_${this._executionCounter}`;

            // Create execution context for this specific run
            const executionContext = {
                id: executionId,
                flowName: flowName,
                tasks: flowDefinition.tasks.map(t => ({ ...t, retries: 0 })), // Clone tasks with execution-specific retry counts
                options: flowDefinition.options,
                logLevel: flowDefinition.options.logLevel,
                logger: flowDefinition.options.logger,
                context: { ...initialContext }, // Clone initial context
                currentTaskIndex: 0,
                status: STATUS.IDLE,
                lastError: null,
                signalData: null, // Data passed with a signal (e.g., PAUSE)
                pauseRequested: false, // Flag for external pause request
                flowInstance: null // Will be set below
            };

            const instance = new FlowInstance(this, flowName, executionContext);
            executionContext.flowInstance = instance; // Give context access to its instance
            this._activeInstances.set(executionId, executionContext); // Track active instance

            this._log(executionContext.logLevel, executionContext.logger.info, `[FlowCraft] Starting flow '${flowName}' (Execution ID: ${executionId})`);
            executionContext.status = STATUS.RUNNING;

            // Start execution asynchronously
            setTimeout(() => this._executeFlow(executionContext), 0);

            return instance; // Return the controller immediately
        }


        // --- Internal Execution Logic ---

        async _executeFlow(executionContext) {
            const { flowName, tasks, options, logger, logLevel } = executionContext;

            while (executionContext.currentTaskIndex < tasks.length) {
                if (executionContext.status !== STATUS.RUNNING) {
                    this._log(logLevel, logger.warn, `[FlowCraft] Flow '${flowName}' execution loop interrupted (Status: ${executionContext.status}).`);
                    if (executionContext.status === STATUS.ABORTED && executionContext.flowInstance) {
                       // Already rejected by abort()
                    } else if (executionContext.status === STATUS.PAUSED && executionContext.flowInstance) {
                        // Stay paused, do nothing here, resume() will restart loop
                    }
                    return; // Exit loop if aborted or paused internally
                }

                const taskIndex = executionContext.currentTaskIndex;
                const taskDefinition = tasks[taskIndex];
                const taskInfo = {
                    id: taskDefinition.id,
                    index: taskIndex,
                    retries: taskDefinition.retries,
                    maxRetries: taskDefinition.options?.maxRetries ?? options.defaultMaxRetries
                };

                 // --- Yielding Hook (Before) ---
                 if (taskDefinition.options?.yieldBefore || options.yieldBeforeTask) {
                    this._log(logLevel, logger.debug, `[FlowCraft][${flowName}] Yielding before task '${taskInfo.id}'`);
                    await yieldToMain();
                    // Check status again after yield, could have been aborted/paused
                    if (executionContext.status !== STATUS.RUNNING) continue;
                 }

                // --- Signal Function ---
                // Allows task to signal framework
                let taskSignal = null;
                let taskSignalData = null;
                const signal = (type, data = null) => {
                    taskSignal = type;
                    taskSignalData = data;
                    this._log(logLevel, logger.info, `[FlowCraft][${flowName}] Task '${taskInfo.id}' signaled: ${type}`);
                };

                this._log(logLevel, logger.info, `[FlowCraft][${flowName}] Running task ${taskIndex + 1}/${tasks.length}: '${taskInfo.id}'`);
                this._log(logLevel, logger.debug, `[FlowCraft][${flowName}] Task context before execution:`, { ...executionContext.context }); // Log shallow copy

                try {
                    // --- Execute Task ---
                    const taskResult = await taskDefinition.func(executionContext.context, { signal, taskInfo });

                    // --- Handle Signals ---
                    if (taskSignal === SIGNAL_TYPE.PAUSE) {
                        executionContext.status = STATUS.PAUSED;
                        executionContext.signalData = taskSignalData;
                        this._log(logLevel, logger.info, `[FlowCraft][${flowName}] Paused by task '${taskInfo.id}'.`);
                        // Don't increment task index, stay here until resumed
                        return; // Exit execution loop, wait for resume()
                    }
                     // Handle other signals here if added...

                    // --- Handle Task Result ---
                    // Tasks generally modify context directly, but result could be used if needed
                    this._log(logLevel, logger.debug, `[FlowCraft][${flowName}] Task '${taskInfo.id}' completed. Result:`, taskResult);
                    taskDefinition.retries = 0; // Reset retries on success

                } catch (error) {
                     // --- Error Handling ---
                     this._log(logLevel, logger.error, `[FlowCraft][${flowName}] Error in task '${taskInfo.id}':`, error);
                     executionContext.lastError = error;

                     let action = ERROR_ACTION.ABORT; // Default action

                     // 1. Try Task-Specific Handler
                     if (typeof taskDefinition.onError === 'function') {
                         try {
                             this._log(logLevel, logger.debug, `[FlowCraft][${flowName}] Calling task-specific onError for '${taskInfo.id}'`);
                             action = await taskDefinition.onError(error, executionContext.context, taskInfo);
                         } catch (handlerError) {
                             this._log(logLevel, logger.error, `[FlowCraft][${flowName}] Error in task-specific onError handler for '${taskInfo.id}':`, handlerError);
                             action = ERROR_ACTION.ABORT; // Abort if handler itself fails
                         }
                     }
                     // 2. Try Flow-Level Handler (if no task handler or task handler didn't resolve)
                     else if (typeof options.onError === 'function') {
                         try {
                              this._log(logLevel, logger.debug, `[FlowCraft][${flowName}] Calling flow-level onError for task '${taskInfo.id}'`);
                              action = await options.onError(error, executionContext.context, taskInfo);
                         } catch (handlerError) {
                             this._log(logLevel, logger.error, `[FlowCraft][${flowName}] Error in flow-level onError handler:`, handlerError);
                             action = ERROR_ACTION.ABORT; // Abort if handler itself fails
                         }
                     }

                     // --- Process Error Action ---
                     if (action === ERROR_ACTION.RETRY) {
                         taskDefinition.retries++;
                         if (taskDefinition.retries <= taskInfo.maxRetries) {
                            this._log(logLevel, logger.warn, `[FlowCraft][${flowName}] Retrying task '${taskInfo.id}' (Attempt ${taskDefinition.retries}/${taskInfo.maxRetries})...`);
                             // Optionally add a delay before retry
                             // await new Promise(res => setTimeout(res, 1000));
                             continue; // Stay on the same task index
                         } else {
                             this._log(logLevel, logger.error, `[FlowCraft][${flowName}] Max retries (${taskInfo.maxRetries}) exceeded for task '${taskInfo.id}'. Aborting.`);
                             action = ERROR_ACTION.ABORT; // Force abort if max retries exceeded
                         }
                     }

                     if (action === ERROR_ACTION.SKIP) {
                         this._log(logLevel, logger.warn, `[FlowCraft][${flowName}] Skipping failed task '${taskInfo.id}'.`);
                         executionContext.currentTaskIndex++; // Move to next task
                         taskDefinition.retries = 0; // Reset retries as we are skipping
                         continue; // Continue loop with next task
                     }

                     if (action === ERROR_ACTION.ABORT) {
                         this._log(logLevel, logger.error, `[FlowCraft][${flowName}] Aborting flow due to error in task '${taskInfo.id}'.`);
                         executionContext.status = STATUS.ERROR;
                         if (executionContext.flowInstance) executionContext.flowInstance._rejectPromise(error);
                         this._activeInstances.delete(executionContext.id);
                         return; // Exit execution loop
                     }

                     // If action is not a recognized constant, assume it's a fallback value
                     this._log(logLevel, logger.info, `[FlowCraft][${flowName}] Error handled for task '${taskInfo.id}'. Using fallback value:`, action);
                     // Potentially update context with the fallback value if needed
                     // executionContext.context.someProperty = action;
                     taskDefinition.retries = 0; // Reset retries as error was handled
                     // Fall through to increment task index and continue

                } // End catch block

                // --- Yielding Hook (After) ---
                if (taskDefinition.options?.yieldAfter || options.yieldAfterTask) {
                     this._log(logLevel, logger.debug, `[FlowCraft][${flowName}] Yielding after task '${taskInfo.id}'`);
                     await yieldToMain();
                     // Check status again after yield
                     if (executionContext.status !== STATUS.RUNNING) continue;
                }

                // --- External Pause Request Check ---
                if (executionContext.pauseRequested) {
                     executionContext.status = STATUS.PAUSED;
                     executionContext.pauseRequested = false; // Reset request flag
                     this._log(logLevel, logger.info, `[FlowCraft][${flowName}] Paused externally after task '${taskInfo.id}'.`);
                     // Don't increment task index yet, pause *after* the completed task
                     return; // Exit execution loop, wait for resume()
                 }

                 // --- Move to next task ---
                 executionContext.currentTaskIndex++;

            } // End while loop

            // --- Flow Completion ---
            if (executionContext.status === STATUS.RUNNING) {
                executionContext.status = STATUS.COMPLETED;
                this._log(logLevel, logger.info, `[FlowCraft][${flowName}] Flow completed successfully.`);
                if (executionContext.flowInstance) executionContext.flowInstance._resolvePromise(executionContext.context); // Resolve with final context
                this._activeInstances.delete(executionContext.id);
            }
        }
    }

    // --- Expose Library ---
    const flowCraftInstance = new FlowCraft();
    // Add constants to the instance for easier use
    flowCraftInstance.STATUS = STATUS;
    flowCraftInstance.LOG_LEVEL = LOG_LEVEL;
    flowCraftInstance.SIGNAL_TYPE = SIGNAL_TYPE;
    flowCraftInstance.ERROR_ACTION = ERROR_ACTION;

    if (typeof define === 'function' && define.amd) {
        define([], function () { return flowCraftInstance; }); // AMD
    } else if (typeof module === 'object' && module.exports) {
        module.exports = flowCraftInstance; // Node.js/CommonJS
    } else {
        global.FlowCraft = flowCraftInstance; // Browser global
    }

}(typeof window !== 'undefined' ? window : global)); // Use window in browser, global in Node (for potential testing)