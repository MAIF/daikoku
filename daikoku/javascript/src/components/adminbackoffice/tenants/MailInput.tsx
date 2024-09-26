import { CodeInput, Form, format, SelectInput, type } from '@maif/react-forms';
import { useContext, useEffect, useRef, useState } from "react";
import { I18nContext } from "../../../contexts";

import showdown from 'showdown';
import classNames from 'classnames';

import '@fortawesome/fontawesome-free/css/all.css';
import 'highlight.js/styles/monokai.css';
import { getCmsPage, getMailTranslations } from '../../../services';
import { PillButton } from '../../inputs/PillButton';
import { CmsViewer } from '../../frontend/CmsViewer'
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
	return words;
}

function overwriteParameters(parameters, content) {
	let out = content;
	for (const parameter in parameters) {
		out = out?.replace(`[${parameters[parameter]}]`, "COUCOU")
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

export function MailInput({ onSubmit, _id, translations, rawContent, defaultRawContent }) {

	// const { translate } = useContext(I18nContext);

	const [email, setEmail] = useState()
	const [useCmsPage, toggleCmsPage] = useState(false)
	const [language, toggleLanguage] = useState("fr")

	const [cmsPage, setCmsPage] = useState()

	const [emails, setEmails] = useState([])

	let parameters = extractRequiredVariables(translations.find(t => t.language === language)?.value)

	if (parameters?.includes('email')) {
		parameters = [
			...parameters,
			...extractRequiredVariables(email)
		]
	}

	useEffect(() => {
		getCmsPage(`${_id}${language}`, {
			email,
		})
			.then(content => setCmsPage(content))
	}, [_id, language])

	useEffect(() => {
		getMailTranslations()
			// @ts-ignore
			.then(r => r.translations
				.sort((a, b) => a._id.split(".")[1] < b._id.split(".")[1] ? -1 : 1)
				.map(r => ({ label: r._id, value: r.content })))
			.then(setEmails)

	}, [])

	const ref = useRef()

	const cmsPageWithParameters = overwriteParameters(parameters, cmsPage)

	return <div className='d-flex gap-3'>
		<div style={{
			flex: 1
		}}>
			<div className='h5 mb-2'>Format du mail</div>
			<PillButton
				className='mb-3'
				leftText="En ligne"
				rightText="Page de CMS"
				onLeftClick={() => toggleCmsPage(false)}
				onRightClick={() => toggleCmsPage(true)}
				rightEnabled={!useCmsPage}
				onChange={console.log}
			/>
			<div className='h5 mb-2'>Contenu</div>
			{!useCmsPage && <CodeInput
				value={rawContent || defaultRawContent}
				onChange={onSubmit}
				mode={'markdown'}
				setRef={e => ref.current = e} />}

			{useCmsPage && <p>La page utilisé est {_id}</p>}
		</div>
		<div style={{
			flex: 1
		}} className='section p-3'>
			<div>Prévisualisation des mails</div>
			<div className=''>
				<label className='mb-1 mt-3'>Langue</label>
				<PillButton
					className='pill-button--small'
					leftText="Francais"
					rightText="Anglais"
					onLeftClick={() => toggleLanguage('fr')}
					onRightClick={() => toggleLanguage('en')}
					rightEnabled={language === 'fr'}
					onChange={toggleLanguage}
				/>
			</div>
			<div className=''>
				<label className='mb-1 mt-3'>Paramètres du mail</label>
				{parameters?.includes('email') && <Select
					// label='[email]'
					// placeholder: 'Select a mail to visualize content'
					options={emails}
					value={email}
					onChange={setEmail}
				/>}
				{parameters.filter(f => f !== 'email').map((acc, c) => {
					return <div key={c}>
						<label>{c}</label>
						<input type="text" value="" />
					</div>
				})}
			</div>
			<div className='section mt-3'>
				{useCmsPage ?
					<div dangerouslySetInnerHTML={{ __html: cmsPageWithParameters, }} /> :
					<div
						className="mrf-preview "
						dangerouslySetInnerHTML={{ __html: converter.makeHtml(rawContent.replace('{{email}}', rawContent) || "") }} />}
			</div>

		</div>
	</div >

}