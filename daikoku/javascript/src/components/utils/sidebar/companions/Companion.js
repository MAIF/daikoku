
import React, { useState, useEffect, useContext } from 'react';
import classNames from 'classnames';
import { ChevronLeft, ChevronRight } from 'react-feather';

import { state } from '..'
import { NavContext, navMode, officeMode } from '../../../../contexts';
import { ApiFrontOffice, ApiBackOffice, TeamBackOffice, TenantBackOffice } from './'

export const Companion = () => {
  const [companionState, setCompanionState] = useState(state.closed);
  const { mode, office, api, team, tenant } = useContext(NavContext);

  useEffect(() => {
    if (mode !== navMode.initial) {
      setCompanionState(state.opened);
    }
  }, [mode]);

  const renderContent = () => {
    switch (office) {
      case officeMode.front:
        switch (mode) {
          case navMode.api:
            return api && <ApiFrontOffice />
        }
      case officeMode.back:
        switch (mode) {
          case navMode.api:
            return api && <ApiFrontOffice />
          case navMode.team:
            return team && <TeamBackOffice />
          case navMode.tenant:
            return tenant && <TenantBackOffice />
        }
    }
  }


  if (mode === navMode.initial) {
    return null;
  }

  return (
    <div className={classNames("navbar-companion", {
      opened: companionState === state.opened,
      closed: companionState === state.closed,
    })}>
      <span className='companion-button' onClick={() => setCompanionState(companionState === state.closed ? state.opened : state.closed)}>
        {companionState === state.closed && <ChevronRight />}
        {companionState === state.opened && <ChevronLeft />}
      </span>
      {renderContent()}
    </div>
  )
}