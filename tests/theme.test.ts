import { describe, expect, it } from 'vitest';
import { defaultFormTheme, formThemeSchema, readFormTheme } from '../src/shared/theme';

const design = {...defaultFormTheme,accent:'plum',font:'editorial',background:'mist',button:'pill',layout:'questions'} as const;

describe('Apparence des questionnaires',()=>{
 it('accepte uniquement les préréglages connus',()=>{
  expect(formThemeSchema.parse(design)).toEqual(design);
  expect(formThemeSchema.safeParse({...design,accent:'red; background:url(javascript:foo)'}).success).toBe(false);
  expect(formThemeSchema.safeParse({...design,style:'background:red'}).success).toBe(false);
 });
 it('revient au thème accessible par défaut en cas de données historiques invalides',()=>{
  expect(readFormTheme(undefined)).toEqual(defaultFormTheme);
  expect(readFormTheme({background:'unknown'})).toEqual(defaultFormTheme);
 });
});
