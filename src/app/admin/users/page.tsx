'use client';

import React, { useState } from 'react';
import { Search, Filter, Users, Plus, MoreHorizontal, Edit, Trash2, Shield, Mail, Calendar, CheckCircle, XCircle } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  lastLogin: string;
  createdAt: string;
}

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddUser, setShowAddUser] = useState(false);

  // Mock user data
  const [users] = useState<User[]>([
    {
      id: '1',
      name: 'John Smith',
      email: 'john.smith@firstclass.com.au',
      role: 'admin',
      status: 'active',
      lastLogin: '2024-03-15T10:30:00Z',
      createdAt: '2024-02-28T10:30:00Z'
    },
    {
      id: '2',
      name: 'Sarah Johnson',
      email: 'sarah.johnson@firstclass.com.au',
      role: 'user',
      status: 'active',
      lastLogin: '2024-03-14T14:15:00Z',
      createdAt: '2024-03-01T14:15:00Z'
    },
    {
      id: '3',
      name: 'Michael Brown',
      email: 'michael.brown@firstclass.com.au',
      role: 'user',
      status: 'inactive',
      lastLogin: '2024-02-20T09:20:00Z',
      createdAt: '2024-01-15T09:20:00Z'
    }
  ]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-purple-600 text-black text-xs rounded-full">
            <Shield className="h-3 w-3 text-purple-600" />
            <span>Admin</span>
          </div>
        );
      case 'user':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-blue-600 text-black text-xs rounded-full">
            <Users className="h-3 w-3 text-blue-600" />
            <span>User</span>
          </div>
        );
      default:
        return <span className="text-gray-400">{role}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-green-600 text-black text-xs rounded-full">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span>Active</span>
          </div>
        );
      case 'inactive':
        return (
          <div className="flex items-center space-x-1 px-2 py-1 bg-white border border-red-600 text-black text-xs rounded-full">
            <XCircle className="h-3 w-3 text-red-600" />
            <span>Inactive</span>
          </div>
        );
      default:
        return <span className="text-gray-400">{status}</span>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-8 space-y-6">
      {/* Stats Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
            <p className="text-gray-600 text-sm mt-1">
              Manage user accounts and permissions for your organization
            </p>
          </div>
          <button 
            onClick={() => setShowAddUser(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="user">Users</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button className="flex items-center justify-center space-x-2 px-4 py-2 bg-white hover:bg-gray-50 border border-black text-black rounded-lg transition-colors">
            <Filter className="h-4 w-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role & Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-700 flex items-center space-x-1">
                        <Mail className="h-3 w-3" />
                        <span>{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col space-y-2">
                      {getRoleBadge(user.role)}
                      {getStatusBadge(user.status)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="text-sm text-gray-900">{formatDateTime(user.lastLogin)}</div>
                      <div className="text-xs text-gray-700">
                        {Math.floor((new Date().getTime() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24))} days ago
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-1 text-xs text-gray-700">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(user.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <Edit className="h-4 w-4 text-gray-600" />
                      </button>
                      <button className="p-2 hover:bg-red-100 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">No users found</div>
            <div className="text-sm text-gray-700">Try adjusting your filters</div>
          </div>
        )}
      </div>

      {/* User count */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="text-sm text-gray-700">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>
    </div>
  );
}