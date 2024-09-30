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

	console.log(out)

	for (const parameter in parameters) {
		if (parameter !== '{{email}}') {
			out = out
				.replaceAll(`[${parameter}]`, parameters[parameter])
		}
	}

	// console.log({ parameters, content, out })
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

	const [useCmsPage, setUseCmsPage] = useState(false)

	const [content, setContent] = useState()
	const [parameters, setParameters] = useState(DEFAULT_PARAMETERS)

	const language = 'fr'

	useEffect(() => {
		if (useCmsPage)
			getCmsPage(`${cmsPageId}${language}`, {
				...parameters,
				email: parameters["{{email}}"]
			})
				.then(content => setContent(content))
	}, [useCmsPage, parameters["{{email}}"]])

	console.log({
		content,
	})

	return <>
		<div className='d-flex gap-3'>
			<div style={{
				flex: 1
			}}>
				<div className='h5 mb-2'>Format du mail</div>
				<PillButton
					className='mb-3'
					leftText="En ligne"
					rightText="Page de CMS"
					onLeftClick={() => setUseCmsPage(false)}
					onRightClick={() => setUseCmsPage(true)}
					rightEnabled={!useCmsPage}
					onChange={console.log}
				/>
				<MailContent
					useCmsPage={useCmsPage}
					cmsPageId={cmsPageId}
					legacyInformations={legacyInformations}
					onLegacyInformationsChange={setContent} />
			</div>
			<div style={{
				flex: 1
			}} className='section p-3'>
				<Preview
					rawContent={content}
					content={overwriteParameters(parameters,
						content?.replace("{{email}}", parameters["{{email}}"])
					)}
					useCmsPage={useCmsPage}
					parameters={parameters}
					setParameters={setParameters} />
			</div>
		</div>
	</>
}

function Parameters({ parameters, setParameters, content, rawContent }) {
	const [emails, setEmails] = useState([])
	const [email, setEmail] = useState()

	useEffect(() => {
		getMailTranslations()
			// @ts-ignore
			.then(r => r.translations
				.sort((a, b) => a._id.split(".")[1] < b._id.split(".")[1] ? -1 : 1)
				.map(r => ({ label: r._id, value: r.content })))
			.then(setEmails)
	}, [])

	const requiredRarameters = extractRequiredVariables(rawContent);

	return <div>
		<label className='mb-1 mt-3'>Paramètres du mail</label>
		<Select
			value={email}
			options={emails}
			onChange={email => {
				setParameters({
					...parameters,
					"{{email}}": email.value
				})
				setEmail(email)
			}}
		/>

		<div className='mt-3'>
			{Object.entries(parameters)
				.filter(([field, _]) => field !== "{{email}}" && requiredRarameters.includes(field))
				.map(([field, value]) => {
					return <div key={field} className='d-flex gap-2 mb-2 justify-space-between'>
						<label style={{ minWidth: 120 }}>{field}</label>
						<input type="text"
							className='form-control'
							value={value}
							placeholder='Saisissez une valeur'
							onChange={e => setParameters({
								...parameters,
								[field]: e.target.value
							})} style={{ flex: 1 }} />
					</div>
				})}
		</div>
	</div>
}

function Preview({ content, rawContent, useCmsPage, parameters, setParameters }) {

	return <div>
		<div>Prévisualisation des mails</div>

		<Parameters
			content={content}
			rawContent={rawContent}
			parameters={parameters}
			setParameters={setParameters} />

		{useCmsPage ?
			<div dangerouslySetInnerHTML={{ __html: content }} /> :

			<div
				className="mrf-preview "
				dangerouslySetInnerHTML={{ __html: converter.makeHtml(content || "") }} />}
	</div>
}

function MailContent({ useCmsPage, cmsPageId, legacyInformations, onLegacyInformationsChange }) {

	if (useCmsPage)
		return <p>La page utilisé est {cmsPageId}</p>

	return <CodeInput
		value={legacyInformations.rawContent || legacyInformations.defaultRawContent}
		onChange={onLegacyInformationsChange}
		mode={'markdown'} />
}