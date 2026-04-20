import { useQuery } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";

import { getCmsPage, getCmsPageByPath } from "../../services";
import { isError } from "../../types";
import { Spinner } from "../utils";

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

    const pageRequest = useQuery({
        queryKey: ["cms-page", path],
        queryFn: () => getCmsPageByPath(path)
    })

    if (pageRequest.isLoading) {
        return <Spinner />
    } else if (pageRequest.data && !isError(pageRequest.data))
        return <div className={className ?? `flex-grow-1`} dangerouslySetInnerHTML={{ __html: pageRequest.data, }} />
    else {
        return fallBack ? fallBack() : null
    }

}