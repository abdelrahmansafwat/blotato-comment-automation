import { startEventsWorker } from './workers/events.worker.js';
import { startActionsWorker } from './workers/actions.worker.js';
import { startSweeper } from './workers/sweeper.js';

startEventsWorker();
startActionsWorker();
await startSweeper();
