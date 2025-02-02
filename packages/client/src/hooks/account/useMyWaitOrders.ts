import { myWaitOrders } from '@/api/waitOrders';
import { useSuspenseQuery } from '@tanstack/react-query';

export function useMyWaitOrders(coin?: string) {
	const QUERY_KEY = 'MY_WAIT_ORDERS';
	const { data } = useSuspenseQuery({
		queryFn: () => myWaitOrders(coin),
		queryKey: [QUERY_KEY],
		refetchOnMount: 'always',
	});

	return data;
}
