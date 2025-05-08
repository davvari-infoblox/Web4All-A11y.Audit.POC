import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { ContactComponent } from './contact/contact.component';
import { OverviewComponent } from './home/overview/overview.component';
import { DetailsComponent } from './home/details/details.component';
import { TeamComponent } from './about/team/team.component';
import { MissionComponent } from './about/mission/mission.component';
import { InfoComponent } from './contact/info/info.component';
import { FormComponent } from './contact/form/form.component';

const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { 
    path: 'home', 
    component: HomeComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewComponent },
      { path: 'details', component: DetailsComponent }
    ]
  },
  { 
    path: 'about', 
    component: AboutComponent,
    children: [
      { path: '', redirectTo: 'mission', pathMatch: 'full' },
      { path: 'mission', component: MissionComponent },
      { path: 'team', component: TeamComponent }
    ]
  },
  { 
    path: 'contact', 
    component: ContactComponent,
    children: [
      { path: '', redirectTo: 'info', pathMatch: 'full' },
      { path: 'info', component: InfoComponent },
      { path: 'form', component: FormComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
