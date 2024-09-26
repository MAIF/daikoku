import { useEffect, useState } from "react";
import { getCmsPage } from "../../services";

type CmsViewerProps = {
    pageId: string
    fields?: any
}

export function CmsViewer({ pageId, fields }: CmsViewerProps) {

    const [cmsPage, setCmsPage] = useState<string>()

    useEffect(() => {
        getCmsPage(pageId, fields)
            .then(page => {
                setCmsPage(page)
            })
    }, [pageId, fields])

    if (cmsPage)
        return <div dangerouslySetInnerHTML={{ __html: cmsPage, }} />

    return null
}   