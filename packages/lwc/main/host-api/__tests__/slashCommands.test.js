import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    registerSlashCommand,
    unregisterSlashCommand,
    getSlashCommands,
    onSlashCommandsChange,
    __resetSlashCommandsForTests,
} from '../slashCommands.ts';

test('registerSlashCommand exposes entry via getSlashCommands', () => {
    __resetSlashCommandsForTests();
    registerSlashCommand({
        command: 'soql',
        description: 'Open SOQL',
        iconName: 'utility:database',
        commandId: 'soql.open',
        appId: 'soql',
    });
    const all = getSlashCommands();
    assert.equal(all.length, 1);
    assert.equal(all[0].command, 'soql');
    assert.equal(all[0].autoExecute, true, 'autoExecute defaults to true');
});

test('command is lowercased', () => {
    __resetSlashCommandsForTests();
    registerSlashCommand({ command: 'MyCmd', description: 'x', iconName: 'utility:info' });
    assert.equal(getSlashCommands()[0].command, 'mycmd');
});

test('unregister callback removes the entry', () => {
    __resetSlashCommandsForTests();
    const off = registerSlashCommand({ command: 'a', description: 'x', iconName: 'utility:info' });
    off();
    assert.equal(getSlashCommands().length, 0);
});

test('re-registering replaces the entry', () => {
    __resetSlashCommandsForTests();
    registerSlashCommand({ command: 'dup', description: 'first', iconName: 'utility:info' });
    registerSlashCommand({ command: 'dup', description: 'second', iconName: 'utility:info' });
    const all = getSlashCommands();
    assert.equal(all.length, 1);
    assert.equal(all[0].description, 'second');
});

test('unregister callback only removes its own entry after replace', () => {
    __resetSlashCommandsForTests();
    const offFirst = registerSlashCommand({
        command: 'dup',
        description: 'first',
        iconName: 'utility:info',
    });
    registerSlashCommand({ command: 'dup', description: 'second', iconName: 'utility:info' });
    offFirst();
    const all = getSlashCommands();
    assert.equal(all.length, 1);
    assert.equal(all[0].description, 'second');
});

test('unregisterSlashCommand removes by name', () => {
    __resetSlashCommandsForTests();
    registerSlashCommand({ command: 'a', description: 'x', iconName: 'utility:info' });
    unregisterSlashCommand('A');
    assert.equal(getSlashCommands().length, 0);
});

test('onSlashCommandsChange fires on register and unregister', () => {
    __resetSlashCommandsForTests();
    let n = 0;
    const off = onSlashCommandsChange(() => {
        n++;
    });
    const offCmd = registerSlashCommand({
        command: 'a',
        description: 'x',
        iconName: 'utility:info',
    });
    offCmd();
    assert.equal(n, 2);
    off();
});

test('listener unsubscribe stops notifications', () => {
    __resetSlashCommandsForTests();
    let n = 0;
    const off = onSlashCommandsChange(() => {
        n++;
    });
    off();
    registerSlashCommand({ command: 'a', description: 'x', iconName: 'utility:info' });
    assert.equal(n, 0);
});

test('autoExecute can be explicitly disabled', () => {
    __resetSlashCommandsForTests();
    registerSlashCommand({
        command: 'model',
        description: 'Change model',
        iconName: 'utility:info',
        autoExecute: false,
    });
    assert.equal(getSlashCommands()[0].autoExecute, false);
});

test('registerSlashCommand rejects missing command', () => {
    assert.throws(
        () =>
            registerSlashCommand({
                command: '',
                description: 'x',
                iconName: 'utility:info',
            }),
        /command must be a non-empty string/
    );
});

test('registerSlashCommand rejects missing description', () => {
    assert.throws(
        () =>
            registerSlashCommand({
                command: 'a',
                description: '',
                iconName: 'utility:info',
            }),
        /description for "a" must be a non-empty string/
    );
});

test('registerSlashCommand rejects missing iconName', () => {
    assert.throws(
        () =>
            registerSlashCommand({
                command: 'a',
                description: 'x',
                iconName: '',
            }),
        /iconName for "a" must be a non-empty string/
    );
});

test('__resetSlashCommandsForTests clears entries and listeners', () => {
    registerSlashCommand({ command: 'a', description: 'x', iconName: 'utility:info' });
    let n = 0;
    onSlashCommandsChange(() => {
        n++;
    });
    __resetSlashCommandsForTests();
    assert.equal(getSlashCommands().length, 0);
    registerSlashCommand({ command: 'b', description: 'x', iconName: 'utility:info' });
    assert.equal(n, 0, 'listener cleared');
});
