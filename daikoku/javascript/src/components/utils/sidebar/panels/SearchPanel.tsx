import { useQuery } from '@tanstack/react-query';
import classNames from 'classnames';
import debounce from 'lodash/debounce';
import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ModalContext } from '../../../../contexts';
import { I18nContext } from '../../../../contexts/i18n-context';
import * as Services from '../../../../services';
import { isError, ITeamSimple } from '../../../../types';
import { Spinner } from '../../Spinner';
import { Box, CornerDownLeft, KeyRound, SearchIcon, Users } from "lucide-react";

type ApiKeySearchOption = {
  value: string,
  team: string,
  api: string,
  version: string,
  keyring: string,
  label: string,
  type: 'apikey'
}

export type SearchOption =
  | {
    value: string,
    label: string,
    type: 'team'
  }
  | {
    value: string,
    team: string,
    label: string,
    version: string,
    type: 'api'
  }
  | ApiKeySearchOption

export type SearchResult = Array<{
  label: string,
  options: SearchOption[]
}>

const apiKeyPath = (option: ApiKeySearchOption) => {
  const apiKeysPage = `/${option.team}/settings/apikeys/${option.api}/${option.version}`;

  return `${apiKeysPage}?keyring=${encodeURIComponent(option.keyring)}`;
}

const optionPath = (option: SearchOption, teams: ITeamSimple[]) => {
  switch (option.type) {
    case 'team':
      return `/${option.value}/settings/dashboard`;
    case 'api': {
      const team = teams.find((t) => t._id === option.team);
      const teamPath = team ? team._humanReadableId : option.team;

      return `/${teamPath}/${option.value}/${option.version}/description`;
    }
    case 'apikey':
      return apiKeyPath(option);
  }
}

const optionLabel = (option: SearchOption) =>
  option.type === 'api' ? `${option.label} - ${option.version}` : option.label;

const optionIcons = {
  team: Users,
  api: Box,
  apikey: KeyRound,
}

export const Search = () => {
  const [results, setResults] = useState<SearchResult>();
  const [focusedResult, setFocusedResult] = useState<number>(0)
  const [focusedOption, setFocusedOption] = useState<number>(-1)

  const { translate } = useContext(I18nContext);
  const { close } = useContext(ModalContext);

  const navigate = useNavigate();

  const myTeamsRequest = useQuery({ queryKey: ['myTeams'], queryFn: () => Services.myTeams() })

  useEffect(() => {
    debouncedSearch('');
  }, []);

  const search = (inputValue: string) => {
    return Services.search(inputValue)
      .then(r => {
        setResults(r.filter(group => group.options.length > 0))
        setFocusedOption(inputValue.trim() ? 0 : -1)
        setFocusedResult(0)
      });
  };

  const handleSelect = (teams: ITeamSimple[]) => {
    if (results) {
      const selectedOption = results[focusedResult]?.options[focusedOption]

      if (selectedOption) {
        close()
        navigate(optionPath(selectedOption, teams))
      }
    }
  }

  const handleChangeSelected = (direction?: "up" | "down") => {
    if (!results?.length)
      return;

    let rIndex = focusedResult;
    let oIndex = focusedOption;

    const currentGroup = results[rIndex];
    const totalGroups = results.length;
    const totalOptions = currentGroup.options.length;

    if (direction === "down") {
      if (oIndex < totalOptions - 1) {
        oIndex++;
      } else {
        if (rIndex < totalGroups - 1) {
          rIndex++;
          oIndex = 0;
        }
      }
    } else if (direction === "up") {
      if (oIndex > 0) {
        oIndex--;
      } else {
        if (rIndex > 0) {
          rIndex--;
          oIndex = results[rIndex].options.length - 1;
        }
      }
    }

    setFocusedResult(rIndex);
    setFocusedOption(oIndex);
  }

  const debouncedSearch = debounce(search, 100, { leading: true });

  if (myTeamsRequest.isLoading) {
    return <Spinner />
  } else if (myTeamsRequest.data && !isError(myTeamsRequest.data)) {
    const teams = myTeamsRequest.data;

    const handleKeyDown = (e) => {
      if (
        e.key === "ArrowDown"
      ) {
        handleChangeSelected("down");
      } else if (
        e.key === "ArrowUp"
      ) {
        handleChangeSelected("up");
      } else if (e.key === "Enter") {
        handleSelect(teams);
      }
    }


    return (
      <div className="d-flex flex-column panel search-panel">
        <div className="search-panel__input">
          <SearchIcon size={16} />
          <input
            placeholder={translate('search.placeholder')}
            className="form-control"
            onChange={(e) => debouncedSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={true}
          />
        </div>
        <div className="blocks col-12">
          {results?.map((r, resultIdx) => {
            return (<div key={resultIdx} className="block">
              <div className="block__category">{r.label}</div>
              <div className="block__entries d-flex flex-column">
                {r.options.map((option, optIndex) => {
                  const Icon = optionIcons[option.type];
                  const focused = resultIdx === focusedResult && optIndex === focusedOption;

                  return (
                    <Link to={optionPath(option, teams)}
                      className={classNames("block__entry__link", { focused })}
                      key={`${option.type}-${option.value}-${optionLabel(option)}`}
                      onClick={close}>
                      <Icon size={16} className="block__entry__icon" />
                      <span className="block__entry__label">{optionLabel(option)}</span>
                      <CornerDownLeft size={14} className="block__entry__hint" />
                    </Link>
                  );
                })}
              </div>
            </div>);
          })}
        </div>
      </div>
    );
  } else {
    return (
      <span>error while fetching teams</span>
    )
  }

};


export const SearchPanel = () => {

  const { openCustomModal, close } = useContext(ModalContext)
  const { translate } = useContext(I18nContext)

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key.toLocaleLowerCase() === 'escape') {
      e.preventDefault()
      close()
    } else if (e.target === document.body && e.key.toLowerCase() === '/') {
      e.preventDefault()
      openModal()
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)

  }, [])

  const openModal = () => {
    openCustomModal({
      content: <Search />
    })
  }

  return (
    <div>
      <button type='button' className='btn --tertiary search-button' onClick={() => openModal()}>
        <div className='d-flex flex-row align-items-center gap-2'>
          <SearchIcon className="fake-placeholder" />
          <div className='fake-placeholder px-3'
            dangerouslySetInnerHTML={
              {
                __html: translate(
                  {
                    key: 'topbar.search.placeholder',
                    replacements: ['<kbd>/</kbd>']
                  }
                )
              }
            } />
        </div>
      </button>

    </div>
  )
}
