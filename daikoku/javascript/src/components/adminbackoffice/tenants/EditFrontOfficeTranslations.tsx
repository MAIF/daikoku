import React, { useContext, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2339): Property 'updateTranslation' does not exist on typ... Remove this comment to see the full error message
    updateTranslation,
    // @ts-expect-error TS(2339): Property 'translations' does not exist on type 'un... Remove this comment to see the full error message
    translations: globalTranslations,
    // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
    translateMethod,
  } = useContext(I18nContext);

  useEffect(() => {
    loadTranslations();
  }, []);

  const loadTranslations = () => {
    return Services.getTranslations('all').then((store) => {
      const t = Object.entries({ ...globalTranslations })
        // @ts-expect-error TS(2339): Property 'translations' does not exist on type 'un... Remove this comment to see the full error message
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
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div className='d-flex flex-row flex-wrap justify-content-end'>
            {original.translations.map((translation: any) => {
              return (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
                      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Table
        // @ts-expect-error TS(2322): Type '{ selfUrl: string; defaultTitle: string; def... Remove this comment to see the full error message
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
