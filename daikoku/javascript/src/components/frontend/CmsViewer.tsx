import { useEffect, useState } from "react";
import { getCmsPage } from "../../services";

type CmsViewerProps = {
    pageId: string
    fields?: any,
    className: string
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