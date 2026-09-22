import { isAbsolute, relative } from 'node:path';

/** Reject incomplete stories and ambiguous test references before running tests. */
export function validateCatalog(catalog) {
  if (catalog.version !== 1 || !Array.isArray(catalog.stories) || !catalog.stories.length) {
    throw new Error('Expected a nonempty version 1 story catalog');
  }
  const ids = new Set();
  for (const story of catalog.stories) {
    if (!/^TG-\d+$/.test(story.issue) || !story.userStory?.trim() || !story.scenarios?.length) {
      throw new Error('Every story needs a TG card, user goal, and scenarios');
    }
    for (const scenario of story.scenarios) {
      if (!scenario.id?.startsWith(`${story.issue}/`) || ids.has(scenario.id)) {
        throw new Error(`Missing, duplicate, or mismatched scenario ID: ${scenario.id}`);
      }
      ids.add(scenario.id);
      for (const key of ['given', 'when', 'then']) {
        if (typeof scenario[key] !== 'string' || !scenario[key].trim()) throw new Error(`${scenario.id}: missing ${key}`);
      }
      if (scenario.manual) {
        if (scenario.tests || typeof scenario.manual !== 'string') throw new Error(`${scenario.id}: invalid manual check`);
      } else if (!scenario.tests?.length) {
        throw new Error(`${scenario.id}: no executable test or manual procedure`);
      } else {
        for (const test of scenario.tests) {
          if (typeof test.file !== 'string' || !test.file.startsWith('tests/') || isAbsolute(test.file)
            || test.file.split('/').includes('..') || !test.file.endsWith('.test.ts') || !test.name?.trim()) {
            throw new Error(`${scenario.id}: invalid test reference`);
          }
        }
      }
    }
  }
}

/** A passing suite is not enough: each named scenario must have its own result. */
export function evaluateStories(catalog, report, { root, candidate, acceptance = {} }) {
  validateCatalog(catalog);
  const scenarios = catalog.stories.flatMap(story => story.scenarios.map(scenario => {
    if (scenario.manual) {
      const record = acceptance.scenarios?.[scenario.id];
      const passed = acceptance.candidate === candidate && record?.status === 'passed'
        && typeof record.environment === 'string' && record.environment.trim()
        && typeof record.evidence === 'string' && record.evidence.trim()
        && Number.isFinite(Date.parse(record.checkedAt)) && Date.parse(record.checkedAt) <= Date.now();
      return { issue: story.issue, id: scenario.id, kind: 'manual', status: passed ? 'passed' : 'pending',
        reason: passed ? 'Recorded acceptance for this candidate' : scenario.manual };
    }
    const tests = scenario.tests.map(reference => {
      const matches = (report.testResults ?? []).filter(file => relative(root, file.name) === reference.file)
        .flatMap(file => file.assertionResults ?? []).filter(test => test.title === reference.name);
      return { ...reference, status: matches.length === 1 ? matches[0].status : 'missing-or-ambiguous' };
    });
    return { issue: story.issue, id: scenario.id, kind: 'automated',
      status: tests.every(test => test.status === 'passed') ? 'passed' : 'failed', tests };
  }));
  const automatedPassed = report.success === true && report.numFailedTestSuites === 0
    && report.numFailedTests === 0 && scenarios.filter(item => item.kind === 'automated').every(item => item.status === 'passed');
  return { candidate, automatedPassed,
    acceptanceComplete: automatedPassed && scenarios.every(item => item.status === 'passed'), scenarios };
}
