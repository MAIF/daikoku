import React, { useContext } from 'react';
import { Can, read, team as TEAM } from '../../utils';
import { I18nContext } from '../../../core';

type Props = {
    user?: any;
    team: any;
    askToJoin?: (...args: any[]) => any;
    redirectToTeamPage?: (...args: any[]) => any;
    redirectToTeamSettings?: (...args: any[]) => any;
};

export function TeamCard(props: Props) {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);

  const { team } = props;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="row border-bottom py-4">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="team__avatar col-2">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <img
          className="img-fluid"
          src={props.team.avatar ? props.team.avatar : '/assets/images/daikoku.svg'}
          alt="avatar"
        />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col-10">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="row">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-12 d-flex justify-content-between">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div onClick={props.redirectToTeamPage}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <h3 className="cursor-pointer underline-on-hover">
                {props.team.name}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <Can I={read} a={TEAM} team={props.team}>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <a
                    href="#"
                    className="ms-3 team__settings"
                    onClick={props.redirectToTeamSettings}
                  >
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-cogs fa-xxs" />
                  </a>
                </Can>
              </h3>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey={`${team._id}.description`} extraConf={team.translation}>
                {team.description}
              </Translation>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="ms-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="btn_group">
                {team.canJoin && !team.alreadyJoin && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <button className="btn btn-sm btn-access-negative me-2" onClick={props.askToJoin}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Translation i18nkey="Join">Join</Translation>
                  </button>
                )}
                {team.canJoin && team.alreadyJoin && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <button className="btn btn-sm btn-access-negative me-2">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Translation i18nkey="Pending request">Pending request</Translation>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
