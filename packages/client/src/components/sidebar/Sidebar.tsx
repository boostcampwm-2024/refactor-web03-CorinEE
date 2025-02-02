import SideDrawer from '@/components/sidebar/SideDrawer';
import Calendar from '@asset/calendar.svg?react';
import Heart from '@asset/heart.svg?react';
import Invest from '@asset/invest.svg?react';
import Fire from '@asset/fire.svg?react';
import SideBarButton from '@/components/sidebar/SidebarButton';
import useSideDraw from '@/hooks/ui/useSideDraw';
import { SideBarCategory } from '@/types/category';

function Sidebar() {
	const { activeMenu, isOpen, handleMenu } = useSideDraw();

	type SideBarButtons = {
		id: string;
		icons: JSX.Element;
		text: string;
		active: SideBarCategory;
	};

	const SIDEBAR_BUTTONS: SideBarButtons[] = [
		{
			id: 'invest',
			icons: <Invest />,
			text: '내 투자',
			active: 'MY_INVESTMENT',
		},
		{
			id: 'heart',
			icons: <Heart />,
			text: '관심',
			active: 'INTEREST',
		},
		{
			id: 'calendar',
			icons: <Calendar />,
			text: '최근 본',
			active: 'RECENTLY_VIEWED',
		},
		{
			id: 'fire',
			icons: <Fire />,
			text: '실시간',
			active: 'REALTIME',
		},
	];

	return (
		<div className="relative h-full flex">
			<SideDrawer isOpen={isOpen} activeMenu={activeMenu} />
			<div className="w-14 flex flex-col gap-3 items-center bg-gray-100 border-l border-gray-400 border-solid h-full">
				{SIDEBAR_BUTTONS.map((button) => (
					<SideBarButton
						key={button.id}
						icons={button.icons}
						text={button.text}
						active={button.active}
						handleMenu={handleMenu}
					/>
				))}
			</div>
		</div>
	);
}

export default Sidebar;
