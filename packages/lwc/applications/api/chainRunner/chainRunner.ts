import { LightningElement, api, track } from 'lwc';
import { invokeCommand } from 'host-api/commands';
import Toast from 'lightning/toast';
import {
    API_CHAIN,
    type ChainStep,
    type ChainRunResult,
} from 'shared/utils';

/**
 * Side panel for building + running an ordered sequence of API requests.
 * Variables extracted from earlier responses (via JSONPath) flow into later
 * steps. Assertions can gate progress.
 *
 * The runner reuses the existing `api.sendStandalone` command so auth and
 * variable substitution are identical to single-shot requests from the app.
 */
export default class ChainRunner extends LightningElement {
    @api isOpen = false;

    @track steps: ChainStep[] = [];
    @track lastRun: ChainRunResult | null = null;
    @track isRunning = false;
    @track initialVariables = '{}';

    handleAddStep(): void {
        this.steps = [
            ...this.steps,
            {
                id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: `Step ${this.steps.length + 1}`,
                request: { method: 'GET', url: '' },
                extract: [],
                assert: [{ status: 200 }],
            },
        ];
    }

    handleRemoveStep(event: CustomEvent): void {
        const { id } = (event as any).currentTarget.dataset;
        this.steps = this.steps.filter(s => s.id !== id);
    }

    handleStepFieldChange(event: CustomEvent): void {
        const target = event.currentTarget as any;
        const { id, field } = target.dataset;
        const value = target.value;
        this.steps = this.steps.map(s => {
            if (s.id !== id) return s;
            if (field === 'name') return { ...s, name: value };
            if (field === 'method') return { ...s, request: { ...s.request, method: value } };
            if (field === 'url') return { ...s, request: { ...s.request, url: value } };
            if (field === 'body') return { ...s, request: { ...s.request, body: value } };
            return s;
        });
    }

    handleVariablesChange(event: CustomEvent): void {
        this.initialVariables = (event.currentTarget as any).value;
    }

    async handleRun(): Promise<void> {
        if (this.steps.length === 0) {
            Toast.show({
                label: 'No steps',
                message: 'Add at least one step to the chain.',
                variant: 'warning',
            });
            return;
        }
        let initial: Record<string, string> = {};
        try {
            initial = JSON.parse(this.initialVariables || '{}') || {};
        } catch {
            Toast.show({
                label: 'Invalid variables',
                message: 'Variables must be valid JSON.',
                variant: 'error',
            });
            return;
        }
        this.isRunning = true;
        try {
            const result = await API_CHAIN.runChain(
                this.steps,
                async (input, vars) => {
                    const res: any = await invokeCommand('api.sendStandalone', {
                        method: input.method,
                        url: input.url,
                        headers: input.headers,
                        body: input.body,
                        variables: vars,
                    });
                    if (!res || res.error) {
                        throw new Error(res?.error || 'api.sendStandalone returned no result');
                    }
                    return {
                        content: res.body,
                        contentRaw: res.bodyRaw ?? '',
                        statusCode: res.status,
                        contentHeaders: res.headers || [],
                        contentType: res.contentType || '',
                        contentLength: res.size || 0,
                        executionStartDate: Date.now() - (res.durationMs || 0),
                        executionEndDate: Date.now(),
                    };
                },
                initial
            );
            this.lastRun = result;
            Toast.show({
                label: result.ok ? 'Chain succeeded' : 'Chain failed',
                message: `${result.steps.filter(s => s.status === 'pass').length}/${result.steps.length} steps passed`,
                variant: result.ok ? 'success' : 'error',
            });
        } catch (err: any) {
            Toast.show({
                label: 'Chain run error',
                message: err?.message || String(err),
                variant: 'error',
            });
        } finally {
            this.isRunning = false;
        }
    }

    handleClose(): void {
        this.dispatchEvent(new CustomEvent('close'));
    }

    get stepsWithResults(): Array<
        ChainStep & {
            resultStatus?: string;
            resultStatusCode?: number;
            resultDurationMs?: number;
            resultAssertions?: Array<{ label: string; ok: boolean; reason?: string }>;
            statusBadgeClass?: string;
        }
    > {
        const resultsById = new Map(
            (this.lastRun?.steps || []).map(r => [r.stepId, r] as const)
        );
        return this.steps.map(s => {
            const r = resultsById.get(s.id);
            if (!r) return s;
            const assertions = (r.assertions || []).map(a => ({
                label:
                    'status' in a.assertion
                        ? `status == ${a.assertion.status}`
                        : 'jsonPath' in a.assertion && 'equals' in a.assertion
                          ? `${a.assertion.jsonPath} == ${JSON.stringify(a.assertion.equals)}`
                          : 'contains' in a.assertion
                            ? `contains "${a.assertion.contains}"`
                            : 'headerPresent' in a.assertion
                              ? `header ${a.assertion.headerPresent}`
                              : 'jsonPath' in a.assertion
                                ? `${a.assertion.jsonPath} exists`
                                : 'assertion',
                ok: a.ok,
                reason: a.reason,
            }));
            const badgeClassByStatus: Record<string, string> = {
                pass: 'slds-theme_success',
                fail: 'slds-theme_error',
                error: 'slds-theme_error',
                skipped: 'slds-theme_shade',
            };
            return {
                ...s,
                resultStatus: r.status,
                resultStatusCode: r.response?.statusCode,
                resultDurationMs: r.response
                    ? r.response.executionEndDate - r.response.executionStartDate
                    : undefined,
                resultAssertions: assertions,
                statusBadgeClass: `slds-badge ${badgeClassByStatus[r.status] || ''}`,
            };
        });
    }

    get hasSteps(): boolean {
        return this.steps.length > 0;
    }

    get runButtonLabel(): string {
        return this.isRunning ? 'Running…' : 'Run chain';
    }

    get methodOptions() {
        return [
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' },
            { label: 'PUT', value: 'PUT' },
            { label: 'PATCH', value: 'PATCH' },
            { label: 'DELETE', value: 'DELETE' },
            { label: 'HEAD', value: 'HEAD' },
            { label: 'OPTIONS', value: 'OPTIONS' },
        ];
    }
}
