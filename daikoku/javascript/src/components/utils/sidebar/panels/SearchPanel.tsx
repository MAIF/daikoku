import debounce from 'lodash/debounce';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { useQuery } from '@tanstack/react-query';
import SearchIcon from 'react-feather/dist/icons/search';

import { I18nContext } from '../../../../contexts/i18n-context';
import * as Services from '../../../../services';
import { isError, ITeamSimple } from '../../../../types';
import { Spinner } from '../../Spinner';
import { ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';

export type SearchOption =
  | { value: string, label: string, type: 'team' }
  | { value: string, team: string, label: string, version: string, type: 'api' }

export type SearchResult = [
  {
    label: string,
    options: SearchOption[]
  },
]

export const Search = () => {
  const [results, setResults] = useState<SearchResult>();
  const [focusedResult, setFocusedResult] = useState<number>(0)
  const [focusedOption, setFocusedOption] = useState<number>(0)

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
        setResults(r)
        setFocusedOption(0)
        setFocusedResult(0)
      });
  };

  const handleSelect = (teams: ITeamSimple[]) => {
    if (results) {
      const selectedOption = results[focusedResult].options[focusedOption]

      close()
      if (selectedOption) {
        switch (selectedOption.type) {
          case "api":
            const team = teams.find((t) => t._id === selectedOption.team);
            navigate(`/${team ? team._humanReadableId : selectedOption.team}/${selectedOption.value}/${selectedOption.version}/description`)
            break;
          case "team":
            navigate(`/${selectedOption.value}/settings/dashboard`)
            break;
        }
      }
    }
  }

  const handleChangeSelected = (direction?: "up" | "down") => {
    if (!results)
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
      <div className="d-flex flex-column panel">
        <input
          placeholder={translate('search.placeholder')}
          className="form-control"
          onChange={(e) => debouncedSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus={true}
        />
        <div className="blocks col-12 mt-3">
          {results?.map((r, resultIdx) => {
            return (<div key={resultIdx} className="mb-3 block">
              <div className="mb-1 block__category">{r.label}</div>
              <div className="ms-2 block__entries block__border d-flex flex-column">
                {r.options.map((option, optIndex) => {
                  switch (option.type) {
                    case 'team':
                      return (
                        <Link to={`/${option.value}/settings/dashboard`}
                          className={classNames("block__entry__link", { focused: resultIdx === focusedResult && optIndex === focusedOption })}
                          key={option.value}
                          onClick={close}>
                          {option.label}
                        </Link>
                      );
                    case 'api':
                      const team = teams.find((t) => t._id === option.team);
                      return (
                        <Link to={`/${team ? team._humanReadableId : option.team}/${option.value}/${option.version}/description`}
                          className={classNames("block__entry__link", { focused: resultIdx === focusedResult && optIndex === focusedOption })}
                          key={`${option.value}-${option.version}`}
                          onClick={close}>
                          {`${option.label} - ${option.version}`}
                        </Link>
                      );
                  }
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
    <div className='col-3'>
      <button type='button' className='search-button' onClick={(e) => openModal()}>
        <div className='d-flex flex-row align-items-center gap-2'>
          <SearchIcon className="fake-placeholder" />
          <div className='fake-placeholder px-3' dangerouslySetInnerHTML={{ __html: translate({ key: 'topbar.search.placeholder', replacements: ['<kbd className="mx-1">/</kbd>'] }) }} />
        </div>
      </button>

    </div>
  )
}
