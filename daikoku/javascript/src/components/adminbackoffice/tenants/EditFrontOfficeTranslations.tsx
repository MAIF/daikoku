import React, { useContext, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { toastr } from 'react-redux-toastr';
import { nanoid } from 'nanoid';
import { type, format, constraints } from '@maif/react-forms';

import { I18nContext, openFormModal } from '../../../core';
import * as Services from '../../../services';
import { Table } from '../../inputs';


export function EditFrontOfficeTranslations(props: any) {
  const dispatch = useDispatch();
  const table = useRef();

  const {
        updateTranslation,
        translations: globalTranslations,
        translateMethod,
  } = useContext(I18nContext);

  useEffect(() => {
    loadTranslations();
  }, []);

  const loadTranslations = () => {
    return Services.getTranslations('all').then((store) => {
      const t = Object.entries({ ...globalTranslations })
                .map(([language, { translations: t }]) =>
          Object.entries(t)
            .map(([key, value]) => {
              const existingTranslation = store.translations.find(
                (f: any) => f.key === key && f.language === language.toLowerCase()
              );
              return {
                _id: nanoid(32),
                key,
                language: language.toLowerCase(),
                value: existingTranslation ? existingTranslation.value : value,
                _tenant: props.tenantId,
                lastModificationAt: existingTranslation
                  ? existingTranslation.lastModificationAt
                  : undefined,
                default: value,
              };
            }))
        .flatMap((f) => f)
        .filter((f) => typeof f.default === 'string' || f.default instanceof String)
        .reduce(
          (acc, current) => ({
            ...acc,
                        [current.key]: acc[current.key] ? [...acc[current.key], current] : [current],
          }),
          {}
        )
      return Object.entries(t)
        .map(([message, translations]) => ({ message, translations }))
    });
  };

  const columns = [
    {
      id: 'message',
      Header: translateMethod('mailing_internalization.message_text'),
      style: { textAlign: 'left' },
      accessor: (translation: any) => translateMethod(translation.message),
      sortType: 'basic',
      Cell: ({
        cell: {
          row: { original }
        }
      }: any) => {
        return (
                    <div>
            {translateMethod(original.message)}
          </div>
        )
      }
    },
    {
      id: 'actions',
      style: { textAlign: 'center', width: '120px'},
      Header: translateMethod('Translate'),
      disableSortBy: true,
      disableFilters: true,
      Cell: ({
        cell: {
          row: { original },
        }
      }: any) => {
        return (
                    <div className='d-flex flex-row flex-wrap justify-content-end'>
            {original.translations.map((translation: any) => {
              return (
                                <button type='button' key={translation.language}
                  className='btn btn-outline-success me-2'
                  onClick={() => dispatch(openFormModal({
                    title: `${translateMethod('Translation')} : [${translation.language}]`,
                    schema: {
                      value: {
                        type: type.string,
                        format: format.markdown,
                        label: translateMethod(original.message),
                        constraints: [
                          constraints.required(translateMethod('constraints.required.value')),
                        ]
                      }
                    },
                    value: translation,
                    actionLabel: translateMethod('Translate'),
                    onSubmit: (t: any) => updateTranslation(t)
                    .then(() => {
                      toastr.success(translateMethod('mailing_internalization.translation_updated'))
                                            table.current.update()
                    })
                  }))}>
                  {translation.language}
                </button>
              );
            })}
          </div>
        );
      }
    }
  ]

  return (
        <div>
            <Table
                selfUrl="translations"
        defaultTitle="Translations"
        defaultValue={() => ([])}
        defaultSort="message"
        itemName="translation"
        columns={columns}
        fetchItems={() => loadTranslations()}
        showActions={false}
        showLink={false}
        extractKey={(item: any) => item[0]}
        injectTable={(t: any) => table.current = t}
      />
    </div>
  );
}
