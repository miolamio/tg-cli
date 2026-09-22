import { describe, expect, it } from 'vitest';
import { evaluateStories, validateCatalog } from '../../scripts/story-results.mjs';

const root = '/repo';
const scenario = { id: 'TG-55/automatic', given: 'a named test', when: 'it runs', then: 'its result is checked',
  tests: [{ file: 'tests/unit/example.test.ts', name: 'user completes an action' }] };
const manual = { id: 'TG-55/live', given: 'the affected machine', when: 'a user signs in', then: 'authorization persists', manual: 'Full login is not yet confirmed' };
const catalog = { version: 1, stories: [{ issue: 'TG-55', userStory: 'As an owner I want verified acceptance', scenarios: [scenario, manual] }] };
const report = (status = 'passed') => ({ success: true, numFailedTestSuites: 0, numFailedTests: 0,
  testResults: [{ name: '/repo/tests/unit/example.test.ts', assertionResults: [{ title: scenario.tests[0].name, status }] }] });
const evidence = { candidate: 'current', scenarios: { 'TG-55/live': { status: 'passed', checkedAt: '2026-01-01T00:00:00Z', environment: 'controlled fixture', evidence: 'fixture only' } } };
const evaluate = (data = report(), acceptance = {}) => evaluateStories(catalog, data, { root, candidate: 'current', acceptance });

describe('TG-55 story acceptance gate', () => {
  it('keeps live acceptance pending when automated tests pass', () => {
    expect(evaluate()).toMatchObject({ automatedPassed: true, acceptanceComplete: false });
  });
  it('rejects missing, skipped, failed and ambiguous named tests', () => {
    for (const status of ['skipped', 'pending', 'failed', 'todo']) expect(evaluate(report(status)).automatedPassed).toBe(false);
    expect(evaluate({ ...report(), testResults: [] }).automatedPassed).toBe(false);
    const ambiguous = report();
    ambiguous.testResults[0].assertionResults.push(ambiguous.testResults[0].assertionResults[0]);
    expect(evaluate(ambiguous).automatedPassed).toBe(false);
  });
  it('rejects stale or incomplete manual evidence', () => {
    expect(evaluate(report(), { ...evidence, candidate: 'old' }).acceptanceComplete).toBe(false);
    expect(evaluate(report(), { candidate: 'current', scenarios: { 'TG-55/live': { status: 'passed' } } }).acceptanceComplete).toBe(false);
    expect(evaluate(report(), evidence).acceptanceComplete).toBe(true);
  });
  it('does not hide a failed suite behind passing scenario assertions', () => {
    expect(evaluate({ ...report(), success: false, numFailedTestSuites: 1 }, evidence).acceptanceComplete).toBe(false);
  });
  it('rejects scenarios without criteria, test bindings or a matching card', () => {
    for (const bad of [{ ...scenario, given: '' }, { ...scenario, tests: [] }, { ...scenario, id: 'TG-56/wrong' }]) {
      expect(() => validateCatalog({ ...catalog, stories: [{ ...catalog.stories[0], scenarios: [bad] }] })).toThrow();
    }
  });
});
