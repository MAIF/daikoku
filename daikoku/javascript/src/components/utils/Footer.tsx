import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { Spinner } from './Spinner';

import { GlobalContext } from '../../contexts/globalContext';
import { ICmsPageGQL, isError } from '../../types';
import { CmsViewer, CmsViewerByPath } from '../frontend/CmsViewer';
import * as Services from '../../services';
import { I18nContext } from '../../contexts';

export const Footer = () => {

  const { language } = useContext(I18nContext)
  return (
    <CmsViewerByPath className='footer row mt-2' path={`/customization/footer/${language.toLocaleLowerCase()}`}
      fallBack={() => <OldFooter />
      } />
  )

};

const OldFooter = () => {

  const { customGraphQLClient } = useContext(GlobalContext)
  const { language } = useContext(I18nContext)

  const pageRequest = useQuery({
    queryKey: ["footer-cms-page"],
    queryFn: () => customGraphQLClient.request<{ page: ICmsPageGQL }>(Services.graphql.getCmsPageByName, { name: 'footer.html' }),
  })


  if (pageRequest.isLoading) {
    return <Spinner />
  } else if (pageRequest.data?.page && !isError(pageRequest.data)) {
    return (
      <CmsViewerByPath className='footer row mt-2' path={`/customization/${language.toLocaleLowerCase}`}
        fallBack={() => <CmsViewer className='footer row mt-2' pageId={pageRequest.data.page.id} />
        } />
    )
  } else {
    return null;
  }

};