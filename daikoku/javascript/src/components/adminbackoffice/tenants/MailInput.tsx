import { CodeInput } from '@maif/react-forms';
import { useEffect, useRef, useState } from "react";

import showdown from 'showdown';

import '@fortawesome/fontawesome-free/css/all.css';
import 'highlight.js/styles/monokai.css';
import { getCmsPage, getMailTranslations } from '../../../services';
import { PillButton } from '../../inputs/PillButton';
import Select from 'react-select';

function extractRequiredVariables(str?: string) {
    const dels: Array<number> = [];
    const words: Array<string> = [];

    if (!str)
        return []

    for (let i = 0; i < str.length; i++) {
        if (str[i] === '[') {
            dels.push(i);
        } else if (str[i] === ']' && dels.length > 0) {
            let pos = dels[dels.length - 1];
            dels.pop();

            const len = i - 1 - pos;
            words.push(str.substring(pos + 1, (pos < len ? len : len + pos) + 1));
        }
    }

    if (str.includes("{{email}}"))
        words.push("{{email}}")

    return [...new Set(words)];
}

function overwriteParameters(parameters, content) {
    if (!content)
        return ""

    let out = content;

    if (content.includes('{{email}}')) {
        out = out.replaceAll(`{{email}}`, parameters.email)
    }

    for (const parameter in parameters) {
        if (parameter !== '{{email}}') {
            out = out
                .replaceAll(`[${parameter}]`, parameters[parameter])
        }
    }
    return out;
}

const converter = new showdown.Converter({
    omitExtraWLInCodeBlocks: true,
    ghCompatibleHeaderId: true,
    parseImgDimensions: true,
    simplifiedAutoLink: true,
    tables: true,
    tasklists: true,
    requireSpaceBeforeHeadingText: true,
    ghMentions: true,
    emoji: true,
    ghMentionsLink: '/{u}'
});

interface Range {
    from: any;
    to: any;
}


const commands = [
    {
        name: 'Add header',
        icon: 'heading',
        inject: (range: Range) => [{ from: range.from, insert: "# " }]
    },
    {
        name: 'Add bold text',
        icon: 'bold',
        inject: (range: Range) => [{ from: range.from, insert: "**" }, { from: range.to, insert: '**' }]
    },
    {
        name: 'Add italic text',
        icon: 'italic',
        inject: (range: Range) => [{ from: range.from, insert: '*' }, { from: range.to, insert: '*' }]
    },
    {
        name: 'Add strikethrough text',
        icon: 'strikethrough',
        inject: (range: Range) => [{ from: range.from, insert: '~~' }, { from: range.to, insert: '~~' }]
    },
    {
        name: 'Add link',
        icon: 'link',
        inject: (range: Range) => [{ from: range.from, insert: '[' }, { from: range.to, insert: '](url)' }]
    },
    {
        name: 'Add code',
        icon: 'code',
        inject: (range: Range) => [{ from: range.from, insert: '```\n' }, { from: range.to, insert: '\n```\n' }]
    },
    {
        name: 'Add quotes',
        icon: 'quote-right',
        inject: (range: Range) => [{ from: range.from, insert: '> ' }]
    },
    {
        name: 'Add image',
        icon: 'image',
        inject: (range: Range) => [{ from: range.from, insert: '![' }, { from: range.to, insert: '](image-url)' }]
    },
    {
        name: 'Add unordered list',
        icon: 'list-ul',
        inject: (range: Range) => [{ from: range.from, insert: '* ' }]
    },
    {
        name: 'Add ordered list',
        icon: 'list-ol',
        inject: (range: Range) => [{ from: range.from, insert: '1. ' }]
    },
    {
        name: 'Add check list',
        icon: 'tasks',
        inject: (range: Range) => [{ from: range.from, insert: '* [ ] ' }]
    }
];

const DEFAULT_PARAMETERS = {
    apiName: "WeatherAPI",
    user: "john.doe",
    team: "Development",
    link: "https://weatherapi.example.com",
    teamName: "Backend Team",
    subscription: "Premium Plan",
    "api.name": "WeatherAPI",
    "api.plan": "Pro Plan",
    subject: "New API Subscription",
    email: "john.doe@to.tools",
    body: "Bonjour, Vous avez souscrit à la WeatherAPI avec succès. Votre plan actuel est 'Pro Plan'.",
    tenant: "Acme Corp",
    urlAccept: "https://example.com/accept",
    urlDecline: "https://example.com/decline",
    "{{email}}": ""
}

export function MailInput({ legacyInformations, cmsPageId }) {

    const [emails, setEmails] = useState([])

    const language = 'fr'

    useEffect(() => {
        getMailTranslations()
            // @ts-ignore
            .then(r => r.translations
                .sort((a, b) => a._id.split(".")[1] < b._id.split(".")[1] ? -1 : 1)
                .map(r => ({ label: r._id, value: r.translations[1].value })))
            .then(setEmails)
    }, [])

    return <>
        <div className='d-flex flex-column gap-3'>
            {emails.map(({ label, value }) => <div className='section' style={{ borderRadius: '.25rem', minHeight: '25rem' }} key={label} >
                <Email label={label} value={value} cmsPageId={cmsPageId} language={language} />
            </div>)}
        </div>
    </>
}

function Email({ label, value, cmsPageId, language }) {

    const [useCmsPage, setUseCmsPage] = useState(false)

    const [parameters, setParameters] = useState(DEFAULT_PARAMETERS)

    const [content, setContent] = useState(value)

    useEffect(() => {
        if (useCmsPage)
            getCmsPage(`${cmsPageId}${language}`, {
                ...parameters,
                email: parameters["{{email}}"]
            })
                .then(content => setContent(content))
    }, [useCmsPage, parameters["{{email}}"]])

    return <>
        <div style={{ flex: 1 }} className='p-3'>
            <div className='h5'>{label}</div>
            <p style={{ fontStyle: 'italic' }}>Mail recu quand une demande de clé a été effectué</p>
            <div className='d-flex align-items-center justify-content-between mb-2'>
                Provenance du contenu
                <PillButton
                    leftText="De l'interface"
                    rightText="Page de CMS"
                    onLeftClick={() => setUseCmsPage(false)}
                    onRightClick={() => setUseCmsPage(true)}
                    rightEnabled={!useCmsPage}
                    onChange={console.log}
                />
            </div>
            <MailContent
                onLegacyInformationsChange={newValue => {
                    console.log(newValue)
                }}
                parameters={parameters}
                useCmsPage={useCmsPage}
                cmsPageId={cmsPageId}
                legacyInformations={value} />
        </div>
        <div style={{
            flex: 1
        }} className='p-3 pt-0'>
            <Preview
                // rawContent={content}
                content={overwriteParameters(parameters,
                    (useCmsPage ? content : value)?.replace("{{email}}", parameters["{{email}}"])
                )}
                useCmsPage={useCmsPage}
            // parameters={parameters}
            // setParameters={setParameters}
            />
        </div>
    </>
}

function Preview({ content, useCmsPage }) {
    return <div>
        <p className='h5'>Prévisualisation</p>
        {useCmsPage ?
            <div dangerouslySetInnerHTML={{ __html: content }} /> :

            <div
                className="mrf-preview "
                dangerouslySetInnerHTML={{ __html: converter.makeHtml(content || "") }} />}
    </div>
}

function MailContent({ useCmsPage, cmsPageId, legacyInformations, onLegacyInformationsChange, parameters }) {

    if (useCmsPage)
        return <p>La page utilisé est {cmsPageId}</p>

    return <CodeInput
        value={legacyInformations}
        onChange={onLegacyInformationsChange}
        mode={'markdown'} />
}