/**
 * Typed Redux hooks (HLD §14).
 *
 * The only sanctioned way for components to read the store and dispatch actions.
 * Components never touch the store directly and never mutate the Flow JSON.
 */

import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../state/store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
