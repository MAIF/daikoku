import {ReactNode, useContext, useEffect, useState} from "react";
import {useQuery} from "@tanstack/react-query";

import { graphql, getCmsPage } from "../../services";
import {GlobalContext} from "../../contexts/globalContext";
import {ICmsPageGQL} from "../../types";
import {Spinner} from "../utils";

type CmsViewerProps = {
    pageId: string
    fields?: any,
    className?: string
}

export function CmsViewer({ pageId, fields, className }: CmsViewerProps) {

    const [cmsPage, setCmsPage] = useState<string>()

    useEffect(() => {
        getCmsPage(pageId, fields)
            .then(page => {
                setCmsPage(page)
            })
    }, [pageId, fields])

    if (cmsPage)
        return <div className={className ?? `flex-grow-1`} dangerouslySetInnerHTML={{ __html: cmsPage, }} />

    return null
}

type CmsViewerByPathProps = {
    path: string,
    className?: string,
    fallBack?: () => ReactNode
}
export function CmsViewerByPath({ path, className, fallBack }: CmsViewerByPathProps) {

    const {customGraphQLClient} = useContext(GlobalContext)
    const pageRequest = useQuery({
        queryKey: ["cms-page", path],
        queryFn: () => customGraphQLClient.request<{ page: ICmsPageGQL }>(graphql.getCmsPageByName, { path })
      })

    if (pageRequest.isLoading) {
        return <Spinner />
    } else if (!!pageRequest.data && !!pageRequest.data?.page)
        return <div className={className ?? `flex-grow-1`} dangerouslySetInnerHTML={{ __html: pageRequest.data.page.body, }} />
    else {
        return !!fallBack ? fallBack() : null
    }

}