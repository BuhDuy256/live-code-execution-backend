import express from 'express';
import { codeSessionRouter } from './api/routes/codeSession.route';
import { executionRouter } from './api/routes/execution.route';
import { errorHandler } from './api/middlewares/error.middleware';

const app = express();
const PORT = process.env["PORT"] || 3000;

app.use(express.json());

app.use("/code-sessions", codeSessionRouter);
app.use("/executions", executionRouter);

// Error handling middleware must be registered after all routes
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});