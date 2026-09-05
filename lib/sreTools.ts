export type SreToolName =
  | 'trigger_rollback'
  | 'fetch_telemetry_metrics'
  | 'scale_deployment';

export type SreActionStatus = 'executed' | 'failed';

export type SreAction = {
  tool: SreToolName;
  status: SreActionStatus;
  summary: string;
  parameters: Record<string, string | number>;
};

export const SRE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'trigger_rollback',
      description: 'Roll back a service to a specified version.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service to roll back.' },
          targetVersion: { type: 'string', description: 'Version to restore.' },
        },
        required: ['serviceName', 'targetVersion'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_telemetry_metrics',
      description: 'Fetch a telemetry metric for a service and region.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service to inspect.' },
          metric: { type: 'string', description: 'Metric name to fetch.' },
          region: { type: 'string', description: 'Deployment region.' },
        },
        required: ['serviceName', 'metric', 'region'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scale_deployment',
      description: 'Change the replica count for a deployment.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service to scale.' },
          replicaCount: { type: 'number', description: 'Desired replica count.' },
        },
        required: ['serviceName', 'replicaCount'],
        additionalProperties: false,
      },
    },
  },
] as const;

type ToolArguments = Record<string, unknown>;

function requiredString(args: ToolArguments, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function requiredReplicaCount(args: ToolArguments): number {
  const value = args.replicaCount;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('replicaCount must be a non-negative integer');
  }
  return value;
}

export function executeSreTool(
  tool: string,
  rawArguments: string,
): SreAction {
  try {
    const args = JSON.parse(rawArguments) as ToolArguments;

    switch (tool) {
      case 'trigger_rollback': {
        const serviceName = requiredString(args, 'serviceName');
        const targetVersion = requiredString(args, 'targetVersion');
        return {
          tool,
          status: 'executed',
          summary: `Mock rollback triggered for ${serviceName} to ${targetVersion}.`,
          parameters: { serviceName, targetVersion },
        };
      }
      case 'fetch_telemetry_metrics': {
        const serviceName = requiredString(args, 'serviceName');
        const metric = requiredString(args, 'metric');
        const region = requiredString(args, 'region');
        return {
          tool,
          status: 'executed',
          summary: `Mock telemetry for ${serviceName} in ${region}: ${metric} is within the latest five-minute window.`,
          parameters: { serviceName, metric, region },
        };
      }
      case 'scale_deployment': {
        const serviceName = requiredString(args, 'serviceName');
        const replicaCount = requiredReplicaCount(args);
        return {
          tool,
          status: 'executed',
          summary: `Mock scaling applied to ${serviceName}: ${replicaCount} replicas requested.`,
          parameters: { serviceName, replicaCount },
        };
      }
      default:
        throw new Error(`Unsupported SRE tool: ${tool}`);
    }
  } catch (error) {
    return {
      tool: tool as SreToolName,
      status: 'failed',
      summary: error instanceof Error ? error.message : 'Tool execution failed.',
      parameters: {},
    };
  }
}