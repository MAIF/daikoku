import React, { useEffect, useState } from 'react';
import { useQuery } from 'react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useTenantBackOffice } from '../../../contexts';
import { openInvitationTeamModal } from '../../../core';

import * as Services from '../../../services';
import { IState, ITeamFull, ITeamSimple } from '../../../types';
import { TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';
import {updateTeam} from '../../../core/';
import { update } from 'xstate/lib/actionTypes';

export const TeamMembersForAdmin = () => {
  useTenantBackOffice();

  const currentTeam = useSelector<IState, ITeamSimple>(s => s.context.currentTeam)

  const queryTeam = useQuery(['team-infos'], () => Services.teamFull(params.teamSettingId!));
  const params = useParams();

  const dispatch = useDispatch();

  useEffect(() => {
    if(queryTeam.data) {
      dispatch(updateTeam(queryTeam.data))
    }
  }, [queryTeam]);

  if (!currentTeam) {
    return (
      <div>loading</div>
    );
  }

  return (
    <Can I={manage} a={tenant} dispatchError>
      <TeamMembersSimpleComponent />
    </Can>
  );
};
