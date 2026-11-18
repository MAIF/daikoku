import { expect, test } from '@playwright/test';
import { eligibleBatchTeams } from '../../src/components/utils/teams';
import type { IApiWithAuthorization, ITeamSimple } from '../../src/types';

const teams: Pick<ITeamSimple, '_id' | 'type'>[] = [
  { _id: 'owner', type: 'Organization' },
  { _id: 'consumer', type: 'Organization' },
  { _id: 'personal', type: 'Personal' },
  { _id: 'admin', type: 'Admin' },
];

const api = (
  visibility: IApiWithAuthorization['api']['visibility'],
  authorized: string[] = [],
  owner = 'owner'
) => ({
  api: { visibility, team: { _id: owner } },
  authorizations: authorized.map((team) => ({ team, authorized: true, pending: false })),
});

test('excludes admin APIs and applies team eligibility to public APIs', () => {
  expect(eligibleBatchTeams(teams, [api('AdminOnly')], false)).toEqual([]);
  expect(eligibleBatchTeams(teams, [api('Public')], false).map((team) => team._id))
    .toEqual(['owner', 'consumer', 'personal']);
  expect(eligibleBatchTeams(teams, [api('Public')], true).map((team) => team._id))
    .toEqual(['owner', 'consumer']);
  expect(eligibleBatchTeams([teams[2], teams[3]], [api('Public')], true)).toEqual([]);
});

test('requires authorization or ownership for restricted APIs', () => {
  for (const visibility of ['Private', 'PublicWithAuthorisation'] as const) {
    const restricted = api(visibility, ['consumer']);
    restricted.authorizations.push({ team: 'personal', authorized: false, pending: true });
    expect(eligibleBatchTeams(teams, [restricted], false).map((team) => team._id))
      .toEqual(['owner', 'consumer']);
    expect(eligibleBatchTeams([teams[2], teams[3]], [restricted], false)).toEqual([]);
  }
});

test('only returns teams authorized for every selected API', () => {
  const first = api('PublicWithAuthorisation', ['consumer'], 'other');
  const second = api('Private', ['consumer'], 'owner');
  expect(eligibleBatchTeams(teams, [first], false).map((team) => team._id)).toEqual(['consumer']);
  expect(eligibleBatchTeams(teams, [first, second], false).map((team) => team._id))
    .toEqual(['consumer']);
  expect(eligibleBatchTeams(teams, [first, api('Private')], false)).toEqual([]);
});
