export type JobsTab = 'scheduled' | 'asyncApex' | 'flexQueue' | 'bulk';

export interface TabFilter {
    search: string;
    status: string;
}

export interface TabState<T> {
    isFetching: boolean;
    data: T[];
    error: string | null;
    warnings: string[];
    fetchedAt: number | null;
    hasMore?: boolean;
    offset?: number;
}

export interface ScheduledJob {
    Id: string;
    CronJobDetail?: {
        Name?: string;
        JobType?: string;
    };
    State?: string;
    CronExpression?: string;
    NextFireTime?: string;
    PreviousFireTime?: string;
    TimesTriggered?: number;
}

export interface AsyncApexJob {
    Id: string;
    ApexClass?: {
        Name?: string;
    };
    JobType?: string;
    Status?: string;
    JobItemsProcessed?: number;
    TotalJobItems?: number;
    NumberOfErrors?: number;
    CreatedDate?: string;
    CompletedDate?: string;
    ExtendedStatus?: string;
    MethodName?: string;
}

export interface FlexQueueJob {
    Id: string;
    AsyncApexJobId?: string;
    JobType?: string;
    JobPosition?: number;
    Status?: string;
}

export interface BulkJob {
    id: string;
    _kind: 'ingest' | 'query';
    operation?: string;
    object?: string;
    state?: string;
    numberRecordsProcessed?: number;
    numberRecordsFailed?: number;
    createdDate?: string;
    systemModstamp?: string;
}

export interface BulkJobDetail extends BulkJob {
    apiVersion?: number;
    concurrencyMode?: string;
    contentType?: string;
    lineEnding?: string;
}

export interface ApexTestRunSummary {
    Id?: string;
    Status?: string;
    NumberTestsTotal?: number;
    NumberTestsCompleted?: number;
    NumberTestErrors?: number;
}

export interface ApexTestQueueItem {
    Id: string;
    Status?: string;
    ApexClassId?: string;
    MethodName?: string;
    ExtendedStatus?: string;
}

export interface ApexTestResult {
    Id: string;
    Outcome?: string;
    Message?: string;
    StackTrace?: string;
    ApexClass?: {
        Name?: string;
    };
    ApexClassId?: string;
    MethodName?: string;
    AsyncApexJobId?: string;
    QueueItemId?: string;
}

export interface ApexTestDetails {
    jobId: string;
    summary: ApexTestRunSummary | null;
    queueItems: ApexTestQueueItem[];
    results: ApexTestResult[];
}

export interface DetailState<T> {
    isFetching: boolean;
    data: T | null;
    error: string | null;
}
