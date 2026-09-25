export interface ArrayDisk {
  id: string;
  name: string | null;
  status: string | null;
  temp: number | null;
  numErrors: number | string | null;
  warning: number | null;
  critical: number | null;
}

export interface DockerContainer {
  id: string;
  names: string[];
  state: 'RUNNING' | 'PAUSED' | 'EXITED';
  status: string;
  autoStart: boolean;
}

export interface VmDomain {
  id: string;
  name: string | null;
  state: string;
}

export interface SnapshotOptions {
  array: boolean;
  parity: boolean;
  disks: boolean;
  docker: boolean;
  vms: boolean;
}

export interface Snapshot {
  array?: {
    state?: string;
    disks?: ArrayDisk[];
    parityCheckStatus?: { running: boolean; progress: number | null; errors: number | null; status: string };
  };
  docker?: { containers: DockerContainer[] };
  vms?: { domains: VmDomain[] };
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class UnraidClient {
  public constructor(private readonly endpoint: string, private readonly apiKey: string) {}

  public async snapshot(options: SnapshotOptions): Promise<Snapshot> {
    const selection: string[] = [];
    if (options.array || options.parity || options.disks) {
      const arrayFields = [
        options.array ? 'state' : '',
        options.disks ? 'disks { id name status temp numErrors warning critical }' : '',
        options.parity ? 'parityCheckStatus { running progress errors status }' : '',
      ].filter(Boolean).join('\n');
      selection.push(`array { ${arrayFields} }`);
    }
    if (options.docker) selection.push('docker { containers { id names state status autoStart } }');
    if (options.vms) selection.push('vms { domains { id name state } }');
    if (!selection.length) throw new Error('Enable at least one Unraid resource.');

    return this.request<Snapshot>(`query HomebridgeSnapshot { ${selection.join('\n')} }`);
  }

public async setArrayRunning(running: boolean): Promise<void> {
    await this.request<{ array: unknown }>(`
      mutation SetArrayRunning {
        array { setState(input: { desiredState: ${running ? 'START' : 'STOP'} }) { state } }
      }
    `);
  }

  public async setContainerRunning(id: string, running: boolean): Promise<void> {
    await this.request<{ docker: unknown }>(`
      mutation SetContainerRunning($id: PrefixedID!) {
        docker { ${running ? 'start' : 'stop'}(id: $id) { id state } }
      }
    `, { id });
  }

  public async setVmRunning(id: string, running: boolean): Promise<void> {
    await this.request<{ vm: unknown }>(`
      mutation SetVmRunning($id: PrefixedID!) {
        vm { ${running ? 'start' : 'stop'}(id: $id) }
      }
    `, { id });
  }

  private async request<T>(query: string, variables?: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const payload = await response.json() as GraphqlResponse<T>;
      if (!response.ok || payload.errors?.length || !payload.data) {
        throw new Error(payload.errors?.map((error) => error.message).join('; ') || `HTTP ${response.status}`);
      }
      return payload.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
