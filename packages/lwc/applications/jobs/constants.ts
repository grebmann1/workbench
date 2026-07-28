import type { JobsTab } from './types';
import { getSetupNodeHomePath } from 'shared/utils';

export const JOB_TABS: Array<{ value: JobsTab; label: string; setupLabel: string }> = [
    { value: 'scheduled', label: 'Scheduled', setupLabel: 'Scheduled Jobs' },
    { value: 'asyncApex', label: 'Async Apex', setupLabel: 'Apex Jobs' },
    { value: 'flexQueue', label: 'Flex Queue', setupLabel: 'Apex Flex Queue' },
    { value: 'bulk', label: 'Bulk', setupLabel: 'Bulk Data Load Jobs' },
];

export const AUTO_REFRESH_OPTIONS = [
    { label: 'Off', value: '0' },
    { label: '15s', value: '15000' },
    { label: '30s', value: '30000' },
    { label: '60s', value: '60000' },
];

export const SETUP_LINKS = [
    { label: 'Apex Jobs', url: getSetupNodeHomePath({ setupNode: 'AsyncApexJobs' }) },
    { label: 'Apex Flex Queue', url: getSetupNodeHomePath({ setupNode: 'ApexFlexQueue' }) },
    { label: 'Bulk Data Load Jobs', url: getSetupNodeHomePath({ setupNode: 'AsyncApiJobStatus' }) },
    { label: 'Scheduled Jobs', url: getSetupNodeHomePath({ setupNode: 'ScheduledJobs' }) },
    { label: 'Background Jobs', url: getSetupNodeHomePath({ setupNode: 'ParallelJobsStatus' }) },
];

export const FILTER_ALL = 'all';

export const STATUS_FILTER_OPTIONS = [{ label: 'All statuses', value: FILTER_ALL }];

export const SCHEDULED_SOQL =
    'SELECT Id, CronJobDetailId, CronJobDetail.Name, CronJobDetail.JobType, ' +
    'CronExpression, State, NextFireTime, PreviousFireTime, StartTime, EndTime, ' +
    'TimesTriggered, OwnerId FROM CronTrigger ORDER BY NextFireTime NULLS LAST';

export const ASYNC_APEX_LIMIT = 200;

export function asyncApexSoql(offset = 0): string {
    return (
        'SELECT Id, ApexClassId, ApexClass.Name, JobType, Status, ' +
        'JobItemsProcessed, TotalJobItems, NumberOfErrors, CreatedDate, ' +
        'CompletedDate, ExtendedStatus, MethodName FROM AsyncApexJob ' +
        `ORDER BY CreatedDate DESC LIMIT ${ASYNC_APEX_LIMIT} OFFSET ${offset}`
    );
}

export const FLEX_QUEUE_SOQL =
    "SELECT Id, AsyncApexJobId, JobType, JobPosition FROM FlexQueueItem WHERE JobType = 'BatchApex' ORDER BY JobPosition ASC";

export const BULK_RESULT_ENDPOINTS = {
    successful: ['successfulResults'],
    failed: ['failedResults'],
    unprocessed: ['unprocessedrecords', 'unprocessedRecords'],
};

export const TERMINAL_BULK_STATES = new Set(['JobComplete', 'Failed', 'Aborted']);
