import { OPENAI_BUILT_IN_TOOLS } from './constants';
import { sharedTools } from './modules/shell';
import { soqlTools } from './modules/soql';
import { apexTools } from './modules/apex';
import { apiAgentTools } from './modules/api';
import { connectionTools } from './modules/connections';
import { generalTools } from './modules/general';
import { chromeTools } from './modules/chrome';
import { metadataTools } from './modules/metadata';
import { agentTools } from './modules/agentTools';

export const tools = {
    soql: soqlTools,
    apex: apexTools,
    api: apiAgentTools,
    connections: connectionTools,
    general: generalTools,
    chrome: chromeTools,
    metadata: metadataTools,
    agent: agentTools,
    browserAgent: sharedTools,
};
export const openaiBuiltInTools = OPENAI_BUILT_IN_TOOLS;
export { filterToolsByModel } from './modules/modelToolSupport';
export { createBashTools } from './modules/shell';
export { askUserTool } from './modules/agentTools';
export { resolveQuestion, rejectQuestion } from './modules/askUserBridge';
export { workbenchContextTools } from './modules/workbenchContextTools';
