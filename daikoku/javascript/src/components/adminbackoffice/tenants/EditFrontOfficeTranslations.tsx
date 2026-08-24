import { useContext } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { type, format, constraints } from '@maif/react-forms';

import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { clientFetchData, DynamicTable, DynamicTableFeatures, FilterDef } from '../../inputs';
import { ITranslation } from '../../../types/tenant';
import { ModalContext } from '../../../contexts';
import { useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { isError, ResponseError } from '../../../types';


export function EditFrontOfficeTranslations(props: any) {
  const queryClient = useQueryClient();
  const queryKey = ['front-office-translations'];

  const { alert } = useContext(ModalContext)

  const {
    updateTranslation,
    translations: globalTranslations,
    translate,
  } = useContext(I18nContext);
  const { openFormModal } = useContext(ModalContext);

  type MessageWithTranslations = { message: string, translations: Array<ITranslation> }

  const loadTranslations = (): Promise<ResponseError | Array<MessageWithTranslations>> => {
    return Services.getTranslations()
      .then((store) => {
        if (isError(store)) {
          return store
        } else {
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
            .reduce<{ [key: string]: Array<ITranslation> }>(
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

  const columnHelper = createColumnHelper<DynamicTableFeatures, MessageWithTranslations>()
  const columns = [
    columnHelper.accessor(row => row.translations[0].key, {
      id: 'key',
      meta: { title: translate('mailing_internalization.message_key'), size: 20 },
    }),
    columnHelper.accessor(row => translate(row.message), {
      id: 'message',
      meta: { title: translate('mailing_internalization.message_text'), size: 30 },
    }),
    columnHelper.display({
      id: 'translate',
      meta: { title: translate('Translate'), size: 10, className: 'action-cell' },
      cell: (info) => {
        return (
          <div className='d-flex flex-row flex-wrap justify-content-end gap-2'>
            {info.row.original.translations.map((translation: any) => {
              return (
                <button type='button' key={translation.language}
                  className='btn --secondary --small --icon-only'
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
                            queryClient.invalidateQueries({ queryKey })
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

  const fetchData = clientFetchData<MessageWithTranslations>(
    () => loadTranslations(),
    {
      searchable: (row) => [row.translations[0]?.key, translate(row.message)],
      sortValues: {
        key: (row) => row.translations[0]?.key,
        message: (row) => translate(row.message),
      },
    }
  );

  const filters: FilterDef[] = [
    { id: 'search', type: 'text', placeholder: translate('Search') },
  ];

  return (
    <div>
      <DynamicTable<MessageWithTranslations>
        queryKey={queryKey}
        columns={columns}
        fetchData={fetchData}
        filters={filters}
        defaultSorting={[{ id: 'message', desc: false }]}
        getRowId={row => row.message}
        getRowAriaLabel={row => row.message}
      />
    </div>
  );
}
