import { makeQuestion, type StudioPageData, type StudioQuestion } from './studio';

/**
 * The old questionnaire model stored visible headings in form/page metadata,
 * outside the actual document. This marker opts a draft into a single,
 * ordered collection of text, image and question blocks.
 *
 * The marker is stored as a hidden, valid statement; it survives even when
 * the author deletes every visible block, without a database migration.
 */
const FREEFORM_MARKER='monk-freeform-layout-v1';

type LayoutQuestion={type:string;settings?:Record<string,unknown>};
export function isFreeformMarker(question:LayoutQuestion):boolean {
 return question.type==='statement'&&question.settings?.freeformMarker===FREEFORM_MARKER;
}
export function isFreeformPage(page:{questions:readonly LayoutQuestion[]}):boolean {
 return page.questions.some(isFreeformMarker);
}
function textBlock(value:string,style:'display'|'heading'|'paragraph'):StudioQuestion{
 const block=makeQuestion('statement');
 block.label=value;
 block.settings={...block.settings,textStyle:style};
 return block;
}
export function freeformPage(page:StudioPageData,formTitle='',formDescription:string|null=null,isFirst=false):StudioPageData {
 if(isFreeformPage(page))return page;
 const marker=makeQuestion('statement');
 marker.label='\u2060';
 marker.settings={...marker.settings,freeformMarker:FREEFORM_MARKER};
 const before:StudioQuestion[]=[];
 if(isFirst){
  if(formTitle.trim())before.push(textBlock(formTitle.trim(),'display'));
  if(formDescription?.trim())before.push(textBlock(formDescription.trim(),'paragraph'));
 }
 if(page.title.trim()&&page.title!=='Nouvelle page')before.push(textBlock(page.title.trim(),'heading'));
 if(page.description?.trim())before.push(textBlock(page.description.trim(),'paragraph'));
 return {...page,questions:[marker,...before,...page.questions]};
}
export function freeformDraft(pages:StudioPageData[],formTitle:string,formDescription:string|null):StudioPageData[]{
 return pages.map((page,i)=>freeformPage(page,formTitle,formDescription,i===0));
}
