import React, { useContext, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { type, format, constraints } from '@maif/react-forms';

import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { Table, TableRef } from '../../inputs';
import { ITranslation } from '../../../types/tenant';
import { ModalContext } from '../../../contexts';
import { createColumnHelper } from '@tanstack/react-table';
import { isError, ResponseError } from '../../../types';


export function EditFrontOfficeTranslations(props: any) {
  const table = useRef<TableRef>(undefined);

  const { alert } = useContext(ModalContext)

  const {
    updateTranslation,
    translations: globalTranslations,
    translate,
  } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  useEffect(() => {
    loadTranslations();
  }, []);

  type MessageWithTranslations = { message: string, translations: Array<ITranslation> }

  const loadTranslations = (): Promise<ResponseError | Array<MessageWithTranslations>> => {
    return Services.getTranslations()
      .then((store) => {
        if (isError(store)) {
          return store
        } else  {
          const t = Object.entries({ ...globalTranslations })
            .map(([language, { translations: t }]) =>
              Object.entries(t)
                .map(([key, value]) => {
                  const existingTranslation = store.translations.find(
                    (f) => f.key === key && f.language === language.toLowerCase()
                  );
                  const translation: ITranslation = {
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
                  return translation;
                }))
            .flatMap((f) => f)
            .filter((f) => typeof f.default === 'string' || f.default instanceof String)
            .reduce<{[key: string]: Array<ITranslation>}>(
              (acc, current) => ({
                ...acc,
                [current.key]: acc[current.key] ? [...acc[current.key], current] : [current],
              }),
              {}
            )
          return Object.entries(t)
            .map(([message, translations]) => ({ message, translations }))
        }
      });
  };

  const columnHelper = createColumnHelper<MessageWithTranslations>()
  const columns = [
    columnHelper.accessor(row => row.translations[0].key, {
      header: translate('mailing_internalization.message_key'),
      meta: { style: { textAlign: 'left' } },
      sortingFn: 'basic'
    }),
    columnHelper.accessor(row => translate(row.message), {
      header: translate('mailing_internalization.message_text'),
      meta: { style: { textAlign: 'left' } },
      sortingFn: 'basic'
    }),
    columnHelper.display({
      meta: { style: { textAlign: 'center', width: '120px' } },
      header: translate('Translate'),
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        return (
          <div className='d-flex flex-row flex-wrap justify-content-end'>
            {info.row.original.translations.map((translation: any) => {
              return (
                <button type='button' key={translation.language}
                  className='btn btn-outline-success me-2'
                  onClick={() => openFormModal({
                    title: `${translate('Translation')} : [${translation.language}]`,
                    schema: {
                      value: {
                        type: type.string,
                        format: format.markdown,
                        label: translate(info.row.original.message),
                        constraints: [
                          constraints.required(translate('constraints.required.value')),
                        ]
                      }
                    },
                    value: translation,
                    actionLabel: translate('Translate'),
                    onSubmit: (t: ITranslation) => {
                      if (t.key === 'poumon') {
                        alert({ message: 'poumon n\'a pas de traduction..' }) //🤣 cc mozinor
                      } else {
                        updateTranslation(t)
                          .then(() => {
                            toast.success(translate('mailing_internalization.translation_updated'))
                            table.current?.update()
                          })
                      }
                    }
                  })}>
                  {translation.language}
                </button>
              );
            })}
          </div>
        );
      }
    })
  ]

  return (
    <div>
      <Table
        defaultSort="message"
        columns={columns}
        fetchItems={() => loadTranslations()}
        injectTable={(t: any) => table.current = t}
      />
    </div>
  );
}
