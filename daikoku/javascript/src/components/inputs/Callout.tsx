import { Eye, EyeOff } from "lucide-react"

type CalloutProps = {
    level: 'primary' | 'info' | 'warning' | 'danger' | 'success' | 'neutral'
    title: string
    body: string
}

export const Callout = (props: CalloutProps) => {
    return (
        <div className={`callout --${props.level}`}>
            <div className="d-flex flex-row justify-content-between">
                <div className="callout-title">{props.title}</div>
                <label className="callout__visibility-toggle">
                    <input type="checkbox" className="visually-hidden" defaultChecked />
                    <EyeOff aria-hidden="true" className="callout__visibility-on" />
                    <Eye aria-hidden="true" className="callout__visibility-off" />
                </label>
            </div>
            <div className="callout-text">
                {props.body}
            </div>
        </div>
    )
}